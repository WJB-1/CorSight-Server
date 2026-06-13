/**
 * 路线规划 + 行前预览控制器
 *
 * POST /api/navigation/route
 *
 * 一个请求完成两件事：
 * 1. 路线规划（必须）
 * 2. 行前预览播报（enable_preview=true 时）
 */

const routeService = require('../services/routeService');
const polyline = require('../lib/polyline');
const ragRetrievalService = require('../services/ragRetrievalService');
const broadcastService = require('../services/broadcastService');

/**
 * 路线规划 + 行前预览
 *
 * @param {object} req.body
 * @param {{ lng: number, lat: number }} req.body.origin
 * @param {{ lng: number, lat: number }} req.body.destination
 * @param {string} [req.body.engine='amap']
 * @param {boolean} [req.body.enable_preview=false]
 * @param {object} [req.body.preview_options]
 */
async function route(req, res) {
  try {
    const {
      origin,
      destination,
      engine = 'amap',
      enable_preview = false,
      preview_options = {},
    } = req.body;

    // ── 参数校验 ─────────────────────────────────
    if (!origin || typeof origin.lng !== 'number' || typeof origin.lat !== 'number') {
      return res.status(400).json({ success: false, error: 'invalid_origin', message: 'origin 必须包含 lng 和 lat' });
    }
    if (!destination || typeof destination.lng !== 'number' || typeof destination.lat !== 'number') {
      return res.status(400).json({ success: false, error: 'invalid_destination', message: 'destination 必须包含 lng 和 lat' });
    }

    // ── Step 1: 路线规划 ─────────────────────────
    let routeData;
    try {
      routeData = await routeService.getRoute(origin, destination, engine);
    } catch (err) {
      console.error(`[Navigation] Route error (${engine}):`, err.message);
      return res.status(502).json({
        success: false,
        error: 'route_failed',
        message: `路线规划失败: ${err.message}`,
        engine,
      });
    }

    // 组装基础响应
    const responseData = {
      route: {
        engine: routeData.engine,
        distance_m: routeData.distance_m,
        duration_s: routeData.duration_s,
        steps: routeData.steps.map((s) => ({
          instruction: s.instruction,
          road: s.road,
          distance_m: s.distance_m,
          duration_s: s.duration_s,
          action: s.action,
          walk_type: s.walk_type,
        })),
        waypoint_count: routeData.waypoints.length,
      },
    };

    // ── Step 2: 行前预览（如果开启） ─────────────
    if (enable_preview) {
      const sampleInterval = preview_options.sample_interval_m || 100;

      try {
        // 2a. 沿路线采样（等距 + 拐点必采）
        const samples = polyline.sampleAlongPath(
          routeData.coords,
          sampleInterval,
          routeData.waypoints
        );

        // 2b. 三层数据融合检索
        const sampleContexts = await ragRetrievalService.retrieveForRoute(
          samples,
          routeData.steps
        );

        // 2c. LLM 生成播报
        const broadcast = await broadcastService.generateBroadcast(
          routeData,
          sampleContexts,
          preview_options
        );

        // 统计
        const vlmPoints = sampleContexts.filter((s) => s.vlm.found).length;
        const osmPoints = sampleContexts.filter((s) => s.osm.found).length;

        responseData.preview = {
          enabled: true,
          broadcast,
          sample_points: samples.length,
          waypoint_samples: samples.filter((s) => s.isWaypoint).length,
          vlm_points: vlmPoints,
          osm_points: osmPoints,
        };
      } catch (err) {
        console.error('[Navigation] Preview error:', err.message);
        // 预览失败不影响路线返回
        responseData.preview = {
          enabled: true,
          broadcast: null,
          error: err.message,
        };
      }
    }

    return res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('[Navigation] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'server_error', message: '服务器内部错误' });
  }
}

module.exports = { route };
