/**
 * 场景分类器
 *
 * 输入：扇形内检索到的 OSM 元素 + 可选的高德 walk_type
 * 输出：场景类型 + 对应的 Agent 名称 + 上下文信息
 *
 * 分类规则（优先级从高到低）：
 *   highway=steps               → steps      → StepsAgent
 *   highway=crossing            → crossing   → CrossingAgent
 *   bridge=yes / highway=elevator → overpass  → OverpassAgent
 *   railway=subway_entrance     → subway     → SubwayAgent
 *   highway=footway (无特殊)    → path       → PathAgent
 *   其他                        → generic    → GenericAgent
 */

const AGENT_MAP = {
  steps: 'steps_agent',
  crossing: 'crossing_agent',
  overpass: 'overpass_agent',
  subway: 'subway_agent',
  path: 'path_agent',
  generic: 'generic_agent',
};

/**
 * 对单张图片进行场景分类
 *
 * @param {Array} osmElements - osmLookupService.lookupInPolygon() 返回的元素列表
 * @param {number|null} walkType - 高德 walk_type（可选）
 * @returns {{ scene_type: string, agent_name: string, context: object }}
 */
function classify(osmElements, walkType = null) {
  // 收集所有 OSM 元素的标签，用于规则匹配
  const allTags = [];
  const highwayValues = new Set();
  const specialFlags = new Set();

  for (const elem of osmElements) {
    allTags.push(elem.tags);
    const hw = elem.tags.highway;
    if (hw) highwayValues.add(hw);
    if (elem.tags.bridge === 'yes') specialFlags.add('bridge');
    if (elem.tags.tunnel === 'yes') specialFlags.add('tunnel');
    if (elem.tags.railway && elem.tags.railway.includes('subway')) specialFlags.add('subway');
    if (elem.tags.highway === 'elevator') specialFlags.add('elevator');
  }

  // ── 优先级规则（高→低） ────────────────────────

  // 1. 台阶
  if (highwayValues.has('steps') || walkType === 20 || walkType === 21) {
    return buildResult('steps', { osmElements: summarizeElements(osmElements), walkType });
  }

  // 2. 人行横道
  if (highwayValues.has('crossing') || walkType === 1) {
    return buildResult('crossing', { osmElements: summarizeElements(osmElements), walkType });
  }

  // 3. 天桥/地下通道/电梯
  if (specialFlags.has('bridge') || specialFlags.has('elevator') || walkType === 4) {
    return buildResult('overpass', { osmElements: summarizeElements(osmElements), walkType });
  }

  // 4. 地铁入口
  if (specialFlags.has('subway')) {
    return buildResult('subway', { osmElements: summarizeElements(osmElements), walkType });
  }

  // 5. 普通路段
  if (highwayValues.has('footway') || highwayValues.has('sidewalk') ||
      highwayValues.has('pedestrian') || highwayValues.has('path') ||
      highwayValues.has('living_street')) {
    return buildResult('path', { osmElements: summarizeElements(osmElements), walkType });
  }

  // 6. 通用兜底
  return buildResult('generic', { osmElements: summarizeElements(osmElements), walkType });
}

/**
 * 构建分类结果
 */
function buildResult(sceneType, context) {
  return {
    scene_type: sceneType,
    agent_name: AGENT_MAP[sceneType] || 'generic_agent',
    context,
  };
}

/**
 * 提取 OSM 元素的关键信息摘要（用于注入 Agent 提示词）
 */
function summarizeElements(elements) {
  return elements.slice(0, 10).map((e) => ({
    osm_id: e.osm_id,
    highway: e.tags.highway || null,
    footway: e.tags.footway || null,
    bridge: e.tags.bridge || null,
    crossing: e.tags.crossing || null,
    surface: e.tags.surface || null,
    tactile_paving: e.tags.tactile_paving || null,
    lit: e.tags.lit || null,
    handrail: e.tags.handrail || null,
    step_count: e.tags.step_count || null,
  }));
}

module.exports = {
  classify,
  AGENT_MAP,
};
