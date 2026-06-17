/**
 * RAG 检索服务（编排层）
 *
 * 沿路线采样 → 并行查三路数据 → 融合为上下文。
 *
 * 各路由数据的检索已拆分到独立模块：
 * - vlmTagRetriever.js — VLM 富标签
 * - osmWayRetriever.js — OSM 原始标签
 * - lib/routeContextMatcher.js — 路线步骤匹配
 */

const { retrieveVlmTags } = require('./vlmTagRetriever');
const { retrieveOsmForRoute } = require('./osmWayRetriever');
const { retrieveRouteContext } = require('../lib/routeContextMatcher');

/**
 * 沿路线采样点批量三层检索
 * @param {Array<{coord, bearing, isWaypoint}>} samples
 * @param {Array} steps - 路线步骤
 * @returns {Promise<Array>}
 */
async function retrieveForRoute(samples, steps) {
  console.log(`[RAG] Retrieving context for ${samples.length} sample points...`);
  const t0 = Date.now();

  // 并行：OSM 批量查询
  const [osmResults] = await Promise.all([
    retrieveOsmForRoute(samples.map((s) => s.coord)),
  ]);

  // 逐点融合
  const results = [];
  for (const sample of samples) {
    const coordKey = `${sample.coord[0].toFixed(6)},${sample.coord[1].toFixed(6)}`;

    let vlmResult, osmElements, routeContext;
    try {
      vlmResult = await retrieveVlmTags(sample.coord, sample.bearing);
      osmElements = osmResults.get(coordKey) || [];
      routeContext = retrieveRouteContext(sample.coord, steps);
    } catch (err) {
      console.warn(`[RAG] Error processing point (${sample.coord}):`, err.message);
      vlmResult = { found: false, tags: {}, description: '', confidence: 0, point_id: null };
      osmElements = [];
      routeContext = { found: false, instruction: '', road: '', action: '', walk_type: 0, distance_m: 0 };
    }

    results.push({
      coord: sample.coord,
      bearing: sample.bearing,
      isWaypoint: sample.isWaypoint,
      vlm: vlmResult,
      osm: { found: osmElements.length > 0, elements: osmElements },
      route: routeContext,
    });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const vlmHits = results.filter((r) => r.vlm.found).length;
  const osmHits = results.filter((r) => r.osm.found).length;
  console.log(`[RAG] Done: ${results.length} points, VLM: ${vlmHits}, OSM: ${osmHits} (${elapsed}s)`);

  return results;
}

module.exports = {
  retrieveVlmTags,
  retrieveOsmForRoute,
  retrieveRouteContext,
  retrieveForRoute,
};
