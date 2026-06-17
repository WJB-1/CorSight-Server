/**
 * 实时导航指引引擎 — 滚动摘要式长记忆 VLM 循环
 *
 * 核心逻辑：
 *   帧循环（摄像头 → VLM 分析 → 指引输出 → 摘要记忆 → 下一帧）
 *
 * 解决的问题：
 *   宏观导航指令（"右转"）与微观场景（路口有两个人行/车行入口）不匹配时，
 *   模型通过持续观察摄像头帧，结合历史指引摘要，给出精确的逐帧指引。
 *
 * 设计约束：
 *   1. 频率限制 — 不少于 3 秒/次，避免打断用户执行指令
 *   2. 偏离容忍 — 连续 N 帧确认偏离才提醒，单帧抖动不触发
 *   3. 滚动摘要 — 只保留最近 M 帧的压缩摘要，超出则丢弃最旧
 *   4. 帧质量门控 — 前端负责初步过滤（模糊/太暗不送）
 */

const crypto = require('crypto');
const vlmService = require('./vlmService');
const semanticTagService = require('./semanticTagService');
const geo = require('../lib/geo');

// ── 默认配置 ───────────────────────────────────────
const DEFAULTS = {
  MIN_INTERVAL_MS: 3000,        // 两次处理的最小间隔（毫秒）
  MAX_ROLLING_ENTRIES: 5,       // 滚动摘要最大保留数
  OFFTRACK_THRESHOLD: 2,        // 连续 N 帧偏离才告警
  TOLERANCE_FRAMES: 3,          // 小范围偏离容忍帧数
  NEARBY_TAG_RADIUS_M: 50,      // 检索附近标签的半径（米）
};

// ── 滚动上下文管理器 ───────────────────────────────

/**
 * 管理帧间记忆：每次 VLM 输出中的 summary 字段被压缩存储，
 * 作为下一次 VLM 调用的上下文输入。
 *
 * 结构：
 *   entries = [
 *     { timestamp, macroInstruction, guidance, summary, onTrack }
 *   ]
 */
class RollingContext {
  constructor(maxEntries = DEFAULTS.MAX_ROLLING_ENTRIES) {
    this.entries = [];
    this.maxEntries = maxEntries;
  }

  /**
   * 添加一帧的指引记录
   */
  addEntry(macroInstruction, guidance, summary, onTrack) {
    this.entries.push({
      timestamp: Date.now(),
      macroInstruction,
      guidance,
      summary,
      onTrack,
    });

    // 超出上限则丢弃最旧
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * 获取上一帧的摘要（给 VLM 的输入上下文）
   */
  getLatestSummary() {
    if (this.entries.length === 0) {
      return '导航刚开始，尚未给出任何指引。';
    }
    return this.entries[this.entries.length - 1].summary;
  }

  /**
   * 获取完整上下文文本（用于模型理解历史）
   */
  getContextString() {
    if (this.entries.length === 0) return '无历史上下文。导航刚开始。';

    return this.entries.map((e, i) => {
      const status = e.onTrack ? '正确' : '偏离';
      return `[第${i + 1}步] 宏观指令:"${e.macroInstruction}" | 指引:"${e.guidance}" | 状态:${status} | 摘要:${e.summary}`;
    }).join('\n');
  }

  /**
   * 获取上下文并压缩（如果内容过长，只保留最关键的部分）
   * @returns {string} 压缩后的上下文
   */
  getCompressedContext() {
    const raw = this.getContextString();
    // 如果超过 2000 字，只保留最近 2 帧摘要 + 最早 1 帧摘要
    if (raw.length > 2000 && this.entries.length > 3) {
      const parts = [];
      parts.push(`[初始] ${this.entries[0].summary}`);
      parts.push(`...（中间 ${this.entries.length - 3} 帧摘要已省略）...`);
      parts.push(this.entries.slice(-2).map((e, i) => {
        const status = e.onTrack ? '正确' : '偏离';
        return `[第${this.entries.length - 1 + i}步] 指引:"${e.guidance}" | 状态:${status} | 摘要:${e.summary}`;
      }).join('\n'));
      return parts.join('\n');
    }
    return raw;
  }

  /**
   * 获取最近连续偏离次数
   */
  getConsecutiveOffTrack() {
    let count = 0;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!this.entries[i].onTrack) count++;
      else break;
    }
    return count;
  }

  /**
   * 获取当前长度
   */
  get length() {
    return this.entries.length;
  }
}

// ── 指引会话管理 ───────────────────────────────────

class GuideSession {
  constructor(sessionId, routeData) {
    this.sessionId = sessionId;
    this.routeData = routeData;         // 原始路线数据
    this.rollingContext = new RollingContext();
    this.createdAt = Date.now();
    this.lastProcessedAt = 0;           // 上次处理帧的时间
    this.lastGuidanceAt = 0;            // 上次输出指引的时间
    this.currentStepIndex = 0;          // 当前路线步骤索引
    this.isActive = true;
    this.offTrackCount = 0;             // 容忍计数器（用于小偏离缓冲）
    this.totalFramesProcessed = 0;
  }

  /**
   * 检查频率限制：是否允许处理当前帧
   */
  canProcess(now = Date.now()) {
    return (now - this.lastProcessedAt) >= DEFAULTS.MIN_INTERVAL_MS;
  }

  /**
   * 检查是否应该向用户告警偏离
   * 核心逻辑：连续偏离超过阈值才告警，单帧抖动被容忍
   * @param {boolean} onTrack - 当前帧分析结果
   * @returns {{ shouldAlert: boolean, consecutiveOffTrack: number }}
   */
  evaluateDeviation(onTrack) {
    const consecutiveOffTrack = this.rollingContext.getConsecutiveOffTrack();

    if (!onTrack) {
      this.offTrackCount++;
      // 只有连续偏离达到阈值，且不是刚出发（至少 2 帧以上的上下文）才告警
      const shouldAlert = consecutiveOffTrack >= DEFAULTS.OFFTRACK_THRESHOLD
        && this.totalFramesProcessed >= DEFAULTS.OFFTRACK_THRESHOLD;
      return { shouldAlert, consecutiveOffTrack };
    }

    // 用户已经回到正确路线，重置偏离计数
    this.offTrackCount = 0;
    return { shouldAlert: false, consecutiveOffTrack: 0 };
  }

  /**
   * 根据当前位置更新当前所处的路线步骤
   * @param {{ lng: number, lat: number }} currentPos
   */
  updateRouteStep(currentPos) {
    if (!this.routeData || !this.routeData.steps || this.routeData.steps.length === 0) return '';

    const coords = this.routeData.coords;
    if (!coords || coords.length === 0) return '';

    // 找到距离当前位置最近的路径点索引
    let minDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = geo.haversineDistance([currentPos.lng, currentPos.lat], coords[i]);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    // 计算已走的比例
    const progress = nearestIdx / coords.length;

    // 根据进度匹配合适的路步骤
    const stepCount = this.routeData.steps.length;
    const stepIndex = Math.min(Math.floor(progress * stepCount), stepCount - 1);
    this.currentStepIndex = Math.max(stepIndex, 0);

    const step = this.routeData.steps[this.currentStepIndex];
    return step ? `${step.instruction}（${Math.round(step.distance_m)}米）` : '';
  }

  /**
   * 标记处理完成
   */
  markProcessed() {
    this.lastProcessedAt = Date.now();
    this.lastGuidanceAt = Date.now();
    this.totalFramesProcessed++;
  }

  /**
   * 标记帧已接收但跳过处理（频率限制导致）
   */
  markSkipped() {
    this.lastProcessedAt = Date.now();
  }
}

// ── 会话管理器 ─────────────────────────────────────

class GuideSessionManager {
  constructor() {
    /** @type {Map<string, GuideSession>} */
    this.sessions = new Map();
  }

  /**
   * 创建新指引会话
   * @param {object} routeData - 路线数据（来自 routeService）
   * @returns {string} sessionId
   */
  createSession(routeData) {
    const sessionId = `G_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const session = new GuideSession(sessionId, routeData);
    this.sessions.set(sessionId, session);
    console.log(`[RealtimeGuide] Session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * 获取会话
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 停止/销毁会话
   */
  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.sessions.delete(sessionId);
      console.log(`[RealtimeGuide] Session destroyed: ${sessionId} (processed: ${session.totalFramesProcessed} frames)`);
    }
  }

  /**
   * 清理超时会话（超过 1 小时无活动）
   */
  cleanup(maxAgeMs = 3600000) {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastProcessedAt > maxAgeMs) {
        this.destroySession(id);
      }
    }
  }
}

// ── 单例管理器 ─────────────────────────────────────
const manager = new GuideSessionManager();

// ── 附近标签检索 ────────────────────────────────────

/**
 * 从 semantic_tags 中检索坐标附近的预采集标签
 * @param {{ lng: number, lat: number }} coord
 * @param {number} radiusM
 * @returns {Promise<object|null>}
 */
async function findNearbyTags(coord, radiusM = DEFAULTS.NEARBY_TAG_RADIUS_M) {
  try {
    const tag = await semanticTagService.findNearby([coord.lng, coord.lat], radiusM);

    if (!tag) return null;

    return {
      point_id: tag.point_id,
      merged_osm_tags: tag.merged_osm_tags || {},
      merged_description: tag.merged_description || '',
      scene_description: tag.scene_description || '',
      images: (tag.images || []).map((img) => ({
        bearing: img.bearing,
        scene_type: img.scene_type,
        osm_tags: img.osm_tags || {},
        description: img.description || '',
      })),
    };
  } catch (err) {
    console.warn(`[RealtimeGuide] Nearby tag lookup error:`, err.message);
    return null;
  }
}

// ── 构建 VLM 提示词 ────────────────────────────────

/**
 * 构建指引 VLM 的系统提示词
 */
function buildGuidanceSystemPrompt() {
  return `你是一名实时视障导航指引助手。你的职责是看摄像头画面，结合宏观导航指令和已知环境标签，指导用户安全、准确地前进。

## 核心原则
1. 用户是视障人士，使用"前方""左侧""右侧"等方位词，禁止用"看到""红色""绿色"等视觉词汇
2. 给出具体、可执行的指引，不要模糊描述
3. 如果用户走在正确路线上，简单确认即可，不需要长篇提醒
4. 如果用户偏离路线，必须立即给出明确的纠正指引

## 输出格式（JSON）
{
  "on_track": true/false,
  "guidance": "给用户当前应执行的指引文本，简洁、清晰",
  "correction": null,
  "summary": "一句话总结你刚才告诉了用户什么、用户当前状态如何。这句话将作为下一帧的上下文记忆。"
}`;
}

/**
 * 构建当前帧的用户提示词
 */
function buildGuidanceUserPrompt(macroInstruction, dbTags, previousSummary, contextHistory) {
  const parts = [];

  parts.push(`## 宏观导航指令\n${macroInstruction || '继续沿当前路线前进'}\n`);

  if (dbTags) {
    parts.push(`## 该位置预采集标签`);
    if (dbTags.merged_description) {
      parts.push(`环境描述：${dbTags.merged_description}`);
    }
    if (Object.keys(dbTags.merged_osm_tags).length > 0) {
      parts.push(`环境特征：${JSON.stringify(dbTags.merged_osm_tags)}`);
    }
    parts.push('');
  }

  parts.push(`## 历史指引上下文\n${previousSummary}\n`);

  if (contextHistory && contextHistory.length > 1) {
    parts.push(`## 更早的指引记录（压缩）\n${contextHistory}\n`);
  }

  parts.push(`请分析当前摄像头画面，判断用户是否按照之前的指引在执行，并给出下一步行动指引。`);

  return parts.join('\n');
}

// ── 核心帧处理 ─────────────────────────────────────

/**
 * 处理一帧画面 — 这是整个系统的核心循环
 *
 * @param {string} sessionId
 * @param {string} frameBase64 - 摄像头帧的 base64 JPEG 数据
 * @param {{ lng: number, lat: number }} [currentPos] - 当前位置（可选，用于匹配路线步骤）
 * @returns {Promise<object>} 处理结果
 */
async function processFrame(sessionId, frameBase64, currentPos = null) {
  const session = manager.getSession(sessionId);
  if (!session || !session.isActive) {
    return { success: false, error: 'session_not_found', message: '指引会话不存在或已结束' };
  }

  const now = Date.now();

  // ── 频率限制 ─────────────────────────────────
  if (!session.canProcess(now)) {
    return {
      success: true,
      skipped: true,
      reason: 'rate_limit',
      message: `处理间隔 ${DEFAULTS.MIN_INTERVAL_MS}ms，请稍后再发送`,
      next_allowed_at: session.lastProcessedAt + DEFAULTS.MIN_INTERVAL_MS,
    };
  }

  // 先标记帧已接收（防止并发帧绕过频率限制）
  session.markSkipped();

  try {
    // ── 获取当前宏观指令 ─────────────────────
    let macroInstruction = '';
    if (currentPos) {
      macroInstruction = session.updateRouteStep(currentPos);
    } else {
      const step = session.routeData?.steps?.[session.currentStepIndex];
      macroInstruction = step ? `${step.instruction}（${Math.round(step.distance_m)}米）` : '继续沿路线前进';
    }

    // ── 检索附近预采集标签 ──────────────────
    let dbTags = null;
    if (currentPos) {
      dbTags = await findNearbyTags(currentPos);
    }

    // ── 获取滚动上下文 ───────────────────────
    const previousSummary = session.rollingContext.getLatestSummary();
    const contextHistory = session.rollingContext.getCompressedContext();

    // ── 构建提示词 ───────────────────────────
    const systemPrompt = buildGuidanceSystemPrompt();
    const userPrompt = buildGuidanceUserPrompt(
      macroInstruction,
      dbTags,
      previousSummary,
      contextHistory
    );

    // ── 调 VLM 分析 ─────────────────────────
    const vlmResult = await vlmService.analyzeGuidanceFrame(
      frameBase64,
      systemPrompt,
      userPrompt
    );

    // ── 解析结果 ─────────────────────────────
    const onTrack = vlmResult.on_track !== false;  // 默认 true
    const guidance = vlmResult.guidance || '请继续沿当前路线前进';
    const summary = vlmResult.summary || `告知用户：${guidance.slice(0, 80)}`;
    const correction = vlmResult.correction || null;

    // ── 评估偏离 ─────────────────────────────
    const { shouldAlert, consecutiveOffTrack } = session.evaluateDeviation(onTrack);

    // ── 记录到滚动上下文 ────────────────────
    session.rollingContext.addEntry(macroInstruction, guidance, summary, onTrack);

    // 标记处理完成（这会更新 lastGuidanceAt）
    session.lastProcessedAt = Date.now();
    session.lastGuidanceAt = Date.now();
    session.totalFramesProcessed++;

    // ── 决定输出文本 ─────────────────────────
    let outputText = guidance;
    if (shouldAlert && correction) {
      // 偏离告警时，把纠正指令放在前面
      outputText = `注意偏离路线！${correction}。${guidance}`;
    } else if (shouldAlert && !onTrack) {
      outputText = `注意偏离路线！${guidance}`;
    }

    // 如果用户在线且不需要告警，只是确认
    if (onTrack && !shouldAlert && session.totalFramesProcessed > 1) {
      // 简单确认即可，但如果上次也是 onTrack 且画面没有新信息，可以更简短
      if (session.rollingContext.length <= 2 || session.rollingContext.entries[session.rollingContext.entries.length - 2]?.onTrack) {
        // 持续在线，简短提示
        outputText = `状态正常，${guidance}`;
      }
    }

    return {
      success: true,
      skipped: false,
      on_track: onTrack,
      guidance: outputText,
      correction,
      should_alert: shouldAlert,
      consecutive_offtrack: consecutiveOffTrack,
      total_frames: session.totalFramesProcessed,
      macro_instruction: macroInstruction,
    };
  } catch (err) {
    console.error(`[RealtimeGuide] Frame processing error (${sessionId}):`, err.message);
    // 恢复 lastProcessedAt，让下一帧可以重试
    session.lastProcessedAt = 0;
    return {
      success: false,
      error: 'processing_error',
      message: `帧分析失败: ${err.message}`,
    };
  }
}

// ── 导出 ───────────────────────────────────────────

module.exports = {
  RollingContext,
  GuideSession,
  GuideSessionManager,

  // 管理器单例方法
  createSession: (routeData) => manager.createSession(routeData),
  getSession: (sessionId) => manager.getSession(sessionId),
  destroySession: (sessionId) => manager.destroySession(sessionId),
  cleanup: (maxAge) => manager.cleanup(maxAge),

  // 核心处理
  processFrame,
  findNearbyTags,

  // 配置
  DEFAULTS,
};
