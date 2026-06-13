/**
 * 行前预览播报生成服务
 *
 * 把路线信息 + 采样点三层上下文传给 LLM，生成视障友好的播报文本。
 *
 * 输出三段式结构：
 * 1. 路线概况（总距离、总时长、主要道路）
 * 2. 分段指引（每个关键节点的方向、距离、路况、障碍物）
 * 3. 注意事项（特殊路段提醒：台阶、天桥、施工等）
 */

const OpenAI = require('openai');
const config = require('../config/envConfig');

const DASHSCOPE_API = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

/**
 * 生成行前预览播报
 *
 * @param {object} routeData — 统一格式路线数据（来自 routeService）
 * @param {Array} sampleContexts — 采样点融合上下文（来自 ragRetrievalService）
 * @param {object} [options] — { language, model }
 * @returns {Promise<string>} 播报文本
 */
async function generateBroadcast(routeData, sampleContexts, options = {}) {
  const apiKey = config.llm.BAILIAN_API_KEY;
  if (!apiKey) {
    // 无 API key 时用 fallback
    return generateFallbackBroadcast(routeData, sampleContexts);
  }

  const client = new OpenAI({ apiKey, baseURL: DASHSCOPE_API });

  // 构建系统提示
  const systemPrompt = `你是一名视障导航播报助手。根据以下路线信息和路况数据，生成一段语音播报文本。

要求：
1. 输出三段式结构，用 [SEG] 分隔：
   - [SEG] 路线概况：总距离、总时长、经过的主要道路
   - [SEG] 分段指引：按顺序描述每个关键节点的方向、距离、路况
   - [SEG] 注意事项：台阶、天桥、施工、无声信号灯等特殊提醒
2. 禁止使用视觉性词汇（如"看到""红色""绿色"）
3. 使用方位词（前方/左侧/右侧/身后）而非绝对方向（东/南/西/北）
4. 距离使用米/公里，时间使用分钟
5. 语气平实、清晰，适合语音播报
6. 如果数据中没有视障特殊信息，只基于路线基本数据播报即可`;

  // 构建用户提示（压缩上下文，避免 token 超限）
  const userPrompt = buildUserPrompt(routeData, sampleContexts);

  try {
    const response = await client.chat.completions.create({
      model: options.model || 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const text = response.choices?.[0]?.message?.content || '';
    return text || generateFallbackBroadcast(routeData, sampleContexts);
  } catch (err) {
    console.error('[Broadcast] LLM error:', err.message);
    return generateFallbackBroadcast(routeData, sampleContexts);
  }
}

/**
 * 构建用户提示词（压缩上下文）
 */
function buildUserPrompt(routeData, sampleContexts) {
  const parts = [];

  // 路线基本信息
  parts.push(`## 路线信息`);
  parts.push(`- 总距离：${(routeData.distance_m / 1000).toFixed(1)} 公里`);
  parts.push(`- 预计时间：${Math.round(routeData.duration_s / 60)} 分钟`);
  parts.push(`- 引擎：${routeData.engine}`);

  // 关键步骤
  parts.push(`\n## 分段指引数据`);
  for (const step of routeData.steps.slice(0, 20)) { // 最多 20 步避免超长
    parts.push(`- ${step.instruction}（${step.distance_m}米${step.walk_type ? `, walk_type=${step.walk_type}` : ''}）`);
  }

  // 有 VLM 标签的采样点
  const vlmPoints = sampleContexts.filter((s) => s.vlm.found);
  if (vlmPoints.length > 0) {
    parts.push(`\n## 视障相关信息（VLM 分析）`);
    for (const p of vlmPoints) {
      const v = p.vlm;
      parts.push(`- [bearing=${p.bearing}°] ${v.description || '无描述'}`);
      if (Object.keys(v.tags).length > 0) {
        parts.push(`  标签：${JSON.stringify(v.tags)}`);
      }
    }
  }

  // 有 OSM 标签的采样点（摘要，不全量）
  const osmPoints = sampleContexts.filter((s) => s.osm.found);
  if (osmPoints.length > 0) {
    parts.push(`\n## OSM 路况数据（${osmPoints.length} 个点有数据）`);
    // 只列关键标签
    const uniqueTags = new Set();
    for (const p of osmPoints) {
      for (const elem of p.osm.elements.slice(0, 3)) {
        if (elem.tags.highway) uniqueTags.add(`highway=${elem.tags.highway}`);
        if (elem.tags.surface) uniqueTags.add(`surface=${elem.tags.surface}`);
        if (elem.tags.tactile_paving) uniqueTags.add(`tactile_paving=${elem.tags.tactile_paving}`);
        if (elem.tags.crossing) uniqueTags.add(`crossing=${elem.tags.crossing}`);
      }
    }
    parts.push(`  汇总：${[...uniqueTags].join(', ') || '无特殊标签'}`);
  }

  return parts.join('\n');
}

/**
 * Fallback 播报（无 LLM 时使用，纯模板拼接）
 */
function generateFallbackBroadcast(routeData, sampleContexts) {
  const parts = [];

  // 第一段：路线概况
  const distKm = (routeData.distance_m / 1000).toFixed(1);
  const durMin = Math.round(routeData.duration_s / 60);
  parts.push(`[SEG] 路线总距离 ${distKm} 公里，预计步行 ${durMin} 分钟。`);

  // 第二段：分段指引
  const segments = [];
  for (const step of routeData.steps.slice(0, 10)) {
    if (step.distance_m > 10) {
      segments.push(`${step.instruction}，步行 ${step.distance_m} 米`);
    }
  }
  parts.push(`[SEG] ${segments.join('；')}。`);

  // 第三段：注意事项
  const warnings = [];
  for (const ctx of sampleContexts) {
    if (ctx.vlm.found && ctx.vlm.description) {
      warnings.push(ctx.vlm.description);
    }
  }
  if (warnings.length > 0) {
    parts.push(`[SEG] 注意：${warnings.slice(0, 5).join('；')}。`);
  } else {
    parts.push(`[SEG] 暂无特殊注意事项。`);
  }

  return parts.join('\n');
}

module.exports = { generateBroadcast };
