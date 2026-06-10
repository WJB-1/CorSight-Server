/**
 * 固定路线预览控制器
 *
 * 跳过高德路线规划，直接用预设采样点坐标构造路线，
 * 通过 spatialMiddleware 生成 IR，再走感知+语言流水线。
 *
 * 适用场景：天桥、盲道等高德无法规划的路段。
 */

const { getRoute, listRoutes } = require('../config/presetRoutes');
const { findAllPoints } = require('../models/SamplingPoint');
const spatialMiddleware = require('../middleware/spatialMiddleware');
const perceptionAgent = require('../agents/perceptionAgent');
const languageOptimizerAgent = require('../agents/languageOptimizerAgent');

/**
 * 计算两点间的 Haversine 距离（米）
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 计算方位角，返回中文方位
 */
function bearingToOrientation(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  const bearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;

  if (bearing < 22.5 || bearing >= 337.5) return '北';
  if (bearing < 67.5) return '东北';
  if (bearing < 112.5) return '东';
  if (bearing < 157.5) return '东南';
  if (bearing < 202.5) return '南';
  if (bearing < 247.5) return '西南';
  if (bearing < 292.5) return '西';
  return '西北';
}

/**
 * 根据坐标和场景描述推断 action
 * 注意：固定路线中每个点都是用户选定的采样点，必须保留为关键节点。
 * 使用 '到达' action 确保 spatialMiddleware 的关键词兜底能识别。
 */
function inferAction(desc, walkType, isLast) {
  if (isLast) return '到达';
  if (walkType === 4) return '通过过街天桥';
  if (desc && desc.includes('路口')) return '通过人行横道';
  if (desc && desc.includes('天桥')) return '通过过街天桥';
  return '到达';  // 用 '到达' 而非 '直行'，确保不被 spatialMiddleware 过滤
}

/**
 * GET /api/navigation/preview/fixed
 * 列出所有可用的预设路线
 */
async function listFixedRoutes(req, res) {
  try {
    const routes = listRoutes();
    res.json({ success: true, data: { routes } });
  } catch (error) {
    console.error('[FixedRoute] 列出路线失败:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/navigation/preview/fixed/:routeId
 *
 * 生成固定路线预览（跳过高德路线规划）
 *
 * Request Body (可选):
 * {
 *   "options": {
 *     "enable_perception": true,   // 是否启用 VLM 视觉感知
 *     "enable_broadcast": true     // 是否生成播报文案
 *   }
 * }
 */
async function generateFixedPreview(req, res) {
  try {
    const { routeId } = req.params;
    const { options = {} } = req.body || {};
    const enablePerception = options.enable_perception !== false; // 默认启用
    const enableBroadcast = options.enable_broadcast !== false;

    // 1. 获取预设路线配置
    const route = getRoute(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: `路线 "${routeId}" 不存在。可用路线: ${listRoutes().map(r => r.routeId).join(', ')}`,
      });
    }

    console.log(`[FixedRoute] 生成固定路线预览: ${route.name} (${route.pointIds.length} 个点)`);

    // 2. 查询 MongoDB 获取所有采样点坐标
    const allPoints = await findAllPoints();
    const pointMap = {};
    allPoints.forEach(p => { pointMap[p.point_id] = p; });

    // 验证所有 point_id 都存在
    const missing = route.pointIds.filter(id => !pointMap[id]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `以下采样点不存在: ${missing.join(', ')}`,
      });
    }

    // 3. 按 pointId 顺序构造 pathData（模拟 AMap 格式）
    const steps = [];
    let totalDistance = 0;
    let prevLat = null;
    let prevLng = null;

    for (let i = 0; i < route.pointIds.length; i++) {
      const pid = route.pointIds[i];
      const point = pointMap[pid];
      const lat = point.location.coordinates[1];
      const lng = point.location.coordinates[0];
      const desc = point.scene_description || '';

      // 计算与上一个不同坐标点的距离和方位
      let stepDistance = 0;
      let orientation = '北';
      let polyline = `${lng},${lat}`;

      if (prevLat !== null) {
        stepDistance = Math.round(haversineDistance(prevLat, prevLng, lat, lng));
        orientation = bearingToOrientation(prevLat, prevLng, lat, lng);
        if (stepDistance > 0) {
          polyline = `${prevLng},${prevLat};${lng},${lat}`;
        }
      }

      totalDistance += stepDistance;
      // 只在距离>0时更新 prev 坐标，确保连续相同坐标的点不会丢失方位信息
      if (stepDistance > 0 || prevLat === null) {
        prevLat = lat;
        prevLng = lng;
      }

      const walkType = route.walkTypes[pid] || 0;
      const isLast = (i === route.pointIds.length - 1);
      const action = inferAction(desc, walkType, isLast);

      steps.push({
        action,
        assistant_action: i === route.pointIds.length - 1 ? '到达目的地' : '',
        instruction: desc || (i === 0 ? '从起点出发' : `步行至第${i + 1}个点`),
        road: '',
        walk_type: walkType,
        polyline,
        distance: String(stepDistance),
        orientation,
      });
    }

    // 步行速度约 80m/min
    const totalDuration = Math.round(totalDistance / 80 * 60);

    const pathData = {
      distance: String(totalDistance),
      duration: String(totalDuration),
      steps,
      tolls: 0,
      toll_distance: 0,
      restriction: 0,
    };

    // 4. 通过 spatialMiddleware 生成 IR
    console.log('[FixedRoute] 生成 IR...');
    let irJson = spatialMiddleware.generateIntermediateRepresentation(pathData);

    // 5. 可选：感知 Agent
    if (enablePerception && irJson.key_nodes.length > 0) {
      console.log('[FixedRoute] 启用感知 Agent...');
      try {
        irJson.key_nodes = await perceptionAgent.enrichNodes(irJson.key_nodes);
      } catch (e) {
        console.warn('[FixedRoute] 感知失败:', e.message);
      }
    }

    // 6. 可选：语言 Agent
    let finalText = null;
    if (enableBroadcast) {
      console.log('[FixedRoute] 生成播报文案...');
      try {
        const result = await languageOptimizerAgent.generateBroadcast(irJson);
        if (result.success) {
          finalText = result.text;
        } else {
          throw new Error(result.error);
        }
      } catch (e) {
        console.warn('[FixedRoute] 播报生成失败，使用降级文案:', e.message);
        finalText = generateFallbackText(irJson, route);
      }
    } else {
      finalText = generateFallbackText(irJson, route);
    }

    // 7. 返回结果（格式与标准预览接口一致）
    const response = {
      success: true,
      data: {
        route_summary: irJson.route_summary,
        key_nodes: irJson.key_nodes,
        raw_data: irJson.raw_data,
        ir: irJson,
        text: finalText,
        // 固定路线特有信息
        fixed_route: {
          route_id: routeId,
          route_name: route.name,
          description: route.description,
          point_count: route.pointIds.length,
        },
        metadata: {
          pipeline_version: 'Phase 4 (Fixed Route)',
          steps_completed: [
            'fixed_routing',
            'spatial_filtering',
            ...(enablePerception ? ['perception_enrichment'] : []),
            ...(enableBroadcast ? ['broadcast_generation'] : []),
          ],
        },
      },
    };

    res.json(response);
    console.log(`[FixedRoute] 预览完成: ${route.name}, ${irJson.key_nodes.length} 个节点, ${totalDistance}m`);

  } catch (error) {
    console.error('[FixedRoute] 生成预览失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 降级播报文案（不依赖 LLM）
 */
function generateFallbackText(irData, route) {
  const summary = irData.route_summary;
  const nodes = irData.key_nodes;

  let text = `行前预览：${route.name}。`;
  text += `全程约${summary.total_distance}，预计步行${summary.duration_estimate}。`;
  text += `途经${summary.total_nodes_count}个关键位置：`;

  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const desc = node.instruction || '';
    const dir = node.relative_direction || '';
    if (desc) {
      text += `${desc}`;
      if (!isLast) text += '，';
    }
  });

  text += '。';
  return text;
}

module.exports = {
  listFixedRoutes,
  generateFixedPreview,
};
