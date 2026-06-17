/**
 * 实时导航指引模块 — 接口空壳（占位）
 *
 * 负责：
 *   1. 打开/关闭手机摄像头
 *   2. 帧捕获 → 质量控制（清晰度/亮度过滤）
 *   3. 定时发送帧到 POST /api/guide/frame
 *   4. 接收指引文本 → TTS 播报
 *
 * 接入时需实现：
 *   initCamera()         — 打开摄像头
 *   captureFrame()       — 拍一帧转 base64
 *   isFrameUsable()      — 质量控制（模糊检测/亮度/过暗）
 *   sendFrame()          — POST /api/guide/frame
 *   startGuidanceLoop()  — 启动帧循环（带频率限制）
 *   stopGuidanceLoop()   — 停止循环
 */

const API_BASE = window.API_BASE_URL || '';

// ── 状态 ───────────────────────────────────────────

let sessionId = null;
let stream = null;
let isRunning = false;
let loopTimer = null;
let videoElement = null;
let canvasElement = null;

// ── 待实现的接口（占位） ───────────────────────────

/**
 * 创建指引会话（路线规划后调用）
 * @param {object} routeData - 路线规划返回的完整数据
 * @returns {Promise<string>} sessionId
 */
export async function createGuideSession(routeData) {
  // TODO: POST /api/guide/session
  // const res = await fetch(`${API_BASE}/api/guide/session`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ routeData }),
  // });
  // const data = await res.json();
  // sessionId = data.session_id;
  // return sessionId;
  throw new Error('createGuideSession: not yet implemented');
}

/**
 * 打开摄像头
 * @param {string} videoElementId - <video> 元素的 id
 */
export async function initCamera(videoElementId) {
  // TODO: navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  throw new Error('initCamera: not yet implemented');
}

/**
 * 捕获一帧，转为 base64 data URL
 * @returns {string|null} data:image/jpeg;base64,...
 */
export function captureFrame() {
  // TODO: canvas.drawImage(video, 0, 0, targetWidth, targetHeight)
  //       canvas.toDataURL('image/jpeg', 0.8)
  throw new Error('captureFrame: not yet implemented');
}

/**
 * 帧质量控制：判断当前帧是否合格
 * @param {string} frameBase64
 * @returns {{ usable: boolean, reason?: string }}
 */
export function isFrameUsable(frameBase64) {
  // TODO: 检测亮度、模糊度、运动模糊
  // - 亮度：遍历像素，平均亮度 < 30 判为太暗
  // - 模糊：拉普拉斯方差，低于阈值判为模糊
  return { usable: true };
}

/**
 * 发送帧到后端分析
 * @param {string} frameBase64
 * @param {{ lng: number, lat: number }} [currentPos]
 * @returns {Promise<object>}
 */
export async function sendFrame(frameBase64, currentPos = null) {
  // TODO: POST /api/guide/frame
  // const body = { session_id: sessionId, frame_base64: frameBase64 };
  // if (currentPos) body.current_position = currentPos;
  // const res = await fetch(`${API_BASE}/api/guide/frame`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(body),
  // });
  // return res.json();
  throw new Error('sendFrame: not yet implemented');
}

/**
 * 启动实时指引帧循环
 *
 * 循环逻辑：
 *   1. 每帧先做质量控制（isFrameUsable）
 *   2. 质量合格则发送到后端（sendFrame）
 *   3. 收到结果 → 如果是 skipped（频率限制），跳过不播报
 *   4. 收到结果 → should_alert 或新指引 → 调用 onGuidance 回调
 *   5. 循环间隔：由前后端共同控制，后端有 MIN_INTERVAL_MS 兜底
 *
 * @param {object} callbacks
 * @param {function} callbacks.onGuidance - (text) 收到指引时调用
 * @param {function} callbacks.onAlert - (text) 偏离告警时调用
 * @param {function} callbacks.onError - (err) 错误处理
 * @param {object} [options]
 * @param {number} [options.intervalMs=2000] - 帧捕获间隔（毫秒）
 */
export function startGuidanceLoop(callbacks, options = {}) {
  // TODO: setInterval 循环:
  //   1. captureFrame()
  //   2. isFrameUsable() → 不合格则跳过
  //   3. sendFrame()
  //   4. 处理返回结果 → callbacks.onGuidance / onAlert
  //   5. 注意: 后端已有 3s 间隔限制（MIN_INTERVAL_MS），前端可设 2s
  //      后端返回 skipped 时，前端什么都不做
  throw new Error('startGuidanceLoop: not yet implemented');
}

/**
 * 停止指引循环并关闭摄像头
 */
export function stopGuidanceLoop() {
  // TODO: clearInterval(loopTimer); stream.getTracks().forEach(t => t.stop());
  //       POST /api/guide/stop
  throw new Error('stopGuidanceLoop: not yet implemented');
}

/**
 * 获取当前会话 ID
 */
export function getSessionId() {
  return sessionId;
}

/**
 * 是否正在运行
 */
export function isActive() {
  return isRunning;
}
