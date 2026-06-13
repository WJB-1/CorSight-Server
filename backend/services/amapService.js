/**
 * 高德步行路线服务
 *
 * 调用高德步行路线规划 API，返回统一格式的路线数据。
 *
 * 注意：高德的 polyline 是分号分隔的 "lng,lat" 对，
 *       不是 Google polyline 编码。不能用 decodePolyline。
 */

const axios = require('axios');
const config = require('../config/envConfig');

const API_URL = 'https://restapi.amap.com/v3/direction/walking';

/**
 * 解码高德 polyline（分号分隔的 lng,lat 对）
 * @param {string} encoded — "113.3276,23.1389;113.328,23.139;..."
 * @returns {Array<[number, number]>} [[lng, lat], ...]
 */
function decodeAmapPolyline(encoded) {
  if (!encoded) return [];
  return encoded.split(';').map((pair) => {
    const [lng, lat] = pair.split(',').map(Number);
    return [lng, lat];
  });
}

/**
 * 获取步行路线
 *
 * @param {{ lng: number, lat: number }} origin
 * @param {{ lng: number, lat: number }} destination
 * @returns {Promise<object>} 统一格式路线数据
 */
async function getWalkingRoute(origin, destination) {
  const key = config.amap.AMAP_WEB_KEY;
  if (!key) throw new Error('AMAP_WEB_KEY not configured');

  const originStr = `${origin.lng},${origin.lat}`;
  const destStr = `${destination.lng},${destination.lat}`;

  const { data } = await axios.get(API_URL, {
    params: { key, origin: originStr, destination: destStr },
    timeout: 10000,
  });

  if (data.status !== '1' || !data.route) {
    throw new Error(`AMap API error: ${data.info || 'unknown'}`);
  }

  const path = data.route.paths?.[0];
  if (!path) throw new Error('AMap: no route found');

  // 解析 steps
  const steps = [];
  const waypoints = [];

  for (const step of path.steps) {
    const stepCoords = decodeAmapPolyline(step.polyline);
    steps.push({
      instruction: step.instruction || '',
      road: step.road || '',
      distance_m: Number(step.distance) || 0,
      duration_s: Number(step.duration) || 0,
      action: step.action || '',
      walk_type: step.walk_type || 0,
      polyline: step.polyline,
      coords: stepCoords,
    });

    // 拐点：有转向动作的 step 起始坐标
    if (step.action && stepCoords.length > 0) {
      waypoints.push(stepCoords[0]);
    }
  }

  // 拼接完整路线坐标
  const allCoords = [];
  for (const step of steps) {
    for (const c of step.coords) {
      allCoords.push(c);
    }
  }

  return {
    engine: 'amap',
    distance_m: Number(path.distance) || 0,
    duration_s: Number(path.duration) || 0,
    steps,
    waypoints,
    coords: allCoords,
    polyline: steps.map((s) => s.polyline).join(';'),
  };
}

module.exports = { getWalkingRoute };
