/**
 * 路线规划 + 行前预览控制器
 *
 * POST /api/navigation/route
 *
 * 一个请求完成两件事：
 * 1. 路线规划（必须）
 * 2. 行前预览播报（enable_preview=true 时）
 *
 * SSE 进度推送（可选）：
 * 前端传入 request_id，后端通过 SSE 推送每步进度。
 * 前端需要先 POST 获取 request_id，再 GET /api/sse/stream?requestId=xxx 打开 SSE。
 */

const crypto = require('crypto');
const routeService = require('../services/routeService');
const polyline = require('../lib/polyline');
const ragRetrievalService = require('../services/ragRetrievalService');
const broadcastService = require('../services/broadcastService');
const sseManager = require('../services/sseManager');
const semanticTagService = require('../services/semanticTagService');

/**
 * 获取所有采样点（前端地图标注用）
 * GET /api/navigation/points
 */
async function getPoints(req, res) {
  try {
    const tags = await semanticTagService.findAll();
    return res.json({ success: true, data: tags });
  } catch (err) {
    console.error('[Navigation] getPoints error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 生成 requestId
 */
function generateRequestId() {
  return `R_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 路线规划 + 行前预览
 *
 * @param {object} req.body
 * @param {{ lng: number, lat: number }} req.body.origin
 * @param {{ lng: number, lat: number }} req.body.destination
 * @param {string} [req.body.engine='amap']
 * @param {boolean} [req.body.enable_preview=false]
 * @param {object} [req.body.preview_options]
 * @param {boolean} [req.body.enable_sse=false] — 是否开启 SSE 进度推送
 */
async function route(req, res) {
  try {
    const {
      origin,
      destination,
      engine = 'amap',
      enable_preview = false,
      preview_options = {},
      enable_sse = false,
    } = req.body;

    // ── 参数校验 ─────────────────────────────────
    if (!origin || typeof origin.lng !== 'number' || typeof origin.lat !== 'number') {
      return res.status(400).json({ success: false, error: 'invalid_origin', message: 'origin 必须包含 lng 和 lat' });
    }
    if (!destination || typeof destination.lng !== 'number' || typeof destination.lat !== 'number') {
      return res.status(400).json({ success: false, error: 'invalid_destination', message: 'destination 必须包含 lng 和 lat' });
    }

    // 生成 requestId（无论是否开启 SSE，都返回，方便前端按需连接）
    const requestId = generateRequestId();

    // 如果开启了 SSE，先返回 requestId，后续处理异步推送
    if (enable_sse && enable_preview) {
      // 立即返回 requestId，前端可以用它打开 SSE 连接
      res.json({
        success: true,
        request_id: requestId,
        message: '请求已接收，请通过 SSE 监听进度',
        sse_url: `/api/sse/stream?requestId=${requestId}`,
      });

      // 异步处理，通过 SSE 推送进度
      processRouteWithSSE(requestId, { origin, destination, engine, preview_options });
      return;
    }

    // ── 同步模式（不开启 SSE） ───────────────────
    // Step 1: 路线规划
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

    const responseData = formatRouteResponse(routeData);

    // Step 2: 行前预览（如果开启）
    if (enable_preview) {
      try {
        const previewResult = await processPreview(routeData, preview_options);
        responseData.preview = previewResult;
      } catch (err) {
        console.error('[Navigation] Preview error:', err.message);
        responseData.preview = { enabled: true, broadcast: null, error: err.message };
      }
    }

    return res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('[Navigation] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'server_error', message: '服务器内部错误' });
  }
}

// ── SSE 异步处理流程 ─────────────────────────────

/**
 * 通过 SSE 推送进度的异步处理
 */
async function processRouteWithSSE(requestId, options) {
  const { origin, destination, engine, preview_options } = options;

  try {
    // Step 1: 路线规划
    sseManager.push(requestId, { event: 'progress', step: 'route', message: '正在规划路线...' });

    const routeData = await routeService.getRoute(origin, destination, engine);
    const responseData = formatRouteResponse(routeData);

    sseManager.push(requestId, {
      event: 'progress',
      step: 'route_done',
      message: `路线规划完成：${(routeData.distance_m / 1000).toFixed(1)}公里，约${Math.round(routeData.duration_s / 60)}分钟`,
      route: responseData.route,
    });

    // Step 2: 采样
    const sampleInterval = preview_options.sample_interval_m || 100;
    sseManager.push(requestId, { event: 'progress', step: 'sample', message: '正在沿路线采样...' });

    const samples = polyline.sampleAlongPath(routeData.coords, sampleInterval, routeData.waypoints);

    sseManager.push(requestId, {
      event: 'progress',
      step: 'sample_done',
      message: `采样完成：${samples.length}个采样点（含${samples.filter(s => s.isWaypoint).length}个拐点）`,
    });

    // Step 3: 三层数据检索
    sseManager.push(requestId, { event: 'progress', step: 'rag', message: '正在检索路况数据...' });

    const sampleContexts = await ragRetrievalService.retrieveForRoute(samples, routeData.steps);

    const vlmHits = sampleContexts.filter((s) => s.vlm.found).length;
    const osmHits = sampleContexts.filter((s) => s.osm.found).length;

    sseManager.push(requestId, {
      event: 'progress',
      step: 'rag_done',
      message: `路况检索完成：VLM ${vlmHits}点，OSM ${osmHits}点`,
    });

    // Step 4: LLM 生成播报
    sseManager.push(requestId, { event: 'progress', step: 'broadcast', message: '正在生成播报...' });

    const broadcast = await broadcastService.generateBroadcast(routeData, sampleContexts, preview_options);

    sseManager.push(requestId, { event: 'progress', step: 'broadcast_done', message: '播报生成完毕' });

    // 推送最终结果
    responseData.preview = {
      enabled: true,
      broadcast,
      sample_points: samples.length,
      waypoint_samples: samples.filter((s) => s.isWaypoint).length,
      vlm_points: vlmHits,
      osm_points: osmHits,
    };

    sseManager.push(requestId, {
      event: 'done',
      message: '全部完成',
      data: { success: true, data: responseData },
    });
  } catch (err) {
    console.error(`[Navigation-SSE] Error for ${requestId}:`, err.message);
    sseManager.push(requestId, {
      event: 'error',
      message: err.message,
    });
  } finally {
    // 关闭 SSE 连接
    sseManager.close(requestId);
  }
}

// ── 公共工具函数 ─────────────────────────────────

/**
 * 格式化路线响应数据
 */
function formatRouteResponse(routeData) {
  return {
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
      coords: routeData.coords,   // 路线坐标数组 [[lng,lat], ...]，前端画路线用
      waypoint_count: routeData.waypoints.length,
    },
  };
}

/**
 * 执行行前预览（同步）
 */
async function processPreview(routeData, preview_options) {
  const sampleInterval = preview_options.sample_interval_m || 100;

  const samples = polyline.sampleAlongPath(routeData.coords, sampleInterval, routeData.waypoints);
  const sampleContexts = await ragRetrievalService.retrieveForRoute(samples, routeData.steps);
  const broadcast = await broadcastService.generateBroadcast(routeData, sampleContexts, preview_options);

  const vlmPoints = sampleContexts.filter((s) => s.vlm.found).length;
  const osmPoints = sampleContexts.filter((s) => s.osm.found).length;

  return {
    enabled: true,
    broadcast,
    sample_points: samples.length,
    waypoint_samples: samples.filter((s) => s.isWaypoint).length,
    vlm_points: vlmPoints,
    osm_points: osmPoints,
  };
}

module.exports = { route, getPoints };
