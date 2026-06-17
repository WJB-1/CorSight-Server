/**
 * 播报提示词构建 + Fallback 生成
 *
 * 从 broadcastService 中提取的纯函数。
 * 构建 LLM 输入的 system/user prompt，以及无 LLM 时的 fallback 文本。
 */

const SYSTEM_PROMPT = `你是一名视障导航播报助手。根据以下路线信息和路况数据，生成一段语音播报文本。

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

/**
 * 构建 system prompt
 */
function buildSystemPrompt() {
  return SYSTEM_PROMPT;
}

/**
 * 构建 user prompt（压缩上下文，避免 token 超限）
 */
function buildUserPrompt(routeData, sampleContexts) {
  const parts = [];

  parts.push(`## 路线信息`);
  parts.push(`- 总距离：${(routeData.distance_m / 1000).toFixed(1)} 公里`);
  parts.push(`- 预计时间：${Math.round(routeData.duration_s / 60)} 分钟`);
  parts.push(`- 引擎：${routeData.engine}`);

  parts.push(`\n## 分段指引数据`);
  for (const step of routeData.steps.slice(0, 20)) {
    parts.push(`- ${step.instruction}（${step.distance_m}米${step.walk_type ? `, walk_type=${step.walk_type}` : ''}）`);
  }

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

  const osmPoints = sampleContexts.filter((s) => s.osm.found);
  if (osmPoints.length > 0) {
    parts.push(`\n## OSM 路况数据（${osmPoints.length} 个点有数据）`);
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
 * Fallback 播报（无 LLM 时使用）
 */
function generateFallbackBroadcast(routeData, sampleContexts) {
  const parts = [];
  const distKm = (routeData.distance_m / 1000).toFixed(1);
  const durMin = Math.round(routeData.duration_s / 60);
  parts.push(`[SEG] 路线总距离 ${distKm} 公里，预计步行 ${durMin} 分钟。`);

  const segments = [];
  for (const step of routeData.steps.slice(0, 10)) {
    if (step.distance_m > 10) {
      segments.push(`${step.instruction}，步行 ${step.distance_m} 米`);
    }
  }
  parts.push(`[SEG] ${segments.join('；')}。`);

  const warnings = sampleContexts
    .filter((ctx) => ctx.vlm.found && ctx.vlm.description)
    .map((ctx) => ctx.vlm.description);

  parts.push(warnings.length > 0
    ? `[SEG] 注意：${warnings.slice(0, 5).join('；')}。`
    : `[SEG] 暂无特殊注意事项。`);

  return parts.join('\n');
}

module.exports = { buildSystemPrompt, buildUserPrompt, generateFallbackBroadcast };
