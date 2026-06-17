/**
 * GraphHopper 路线服务
 *
 * 调用本地 GraphHopper 路线规划 API，返回统一格式的路线数据。
 */

const axios = require('axios');
const config = require('../config/envConfig');
const polyline = require('../lib/polyline');

/**
 * 获取步行路线
 *
 * @param {{ lng: number, lat: number }} origin
 * @param {{ lng: number, lat: number }} destination
 * @returns {Promise<object>} 统一格式路线数据
 */
async function getWalkingRoute(origin, destination) {
  const baseUrl = config.graphhopper.GRAPHHOPPER_URL;

  const { data } = await axios.get(`${baseUrl}/route`, {
    params: {
      point: [`${origin.lat},${origin.lng}`, `${destination.lat},${destination.lng}`],
      profile: 'foot',
      locale: 'zh-CN',
      instructions: true,
      points_encoded: true,
      details: ['road_class', 'road_environment', 'surface'],
    },
    timeout: 30000,
  });

  if (!data.paths || data.paths.length === 0) {
    throw new Error('GraphHopper: no route found');
  }

  const path = data.paths[0];
  const ghSteps = path.instructions || [];

  // 转换为统一格式
  const steps = [];
  const waypoints = [];

  for (const inst of ghSteps) {
    // GH 的 text 包含自然语言指令
    const instruction = inst.text || '';
    const distance_m = inst.distance || 0;
    const duration_s = (inst.time || 0) / 1000;

    // GH 的 sign 字段表示转向类型：
    // -3=sharp left, -2=left, -1=slight left, 0=straight, 1=slight right, 2=right, 3=sharp right, 4=finish
    const sign = inst.sign || 0;
    const action = signToAction(sign);

    steps.push({
      instruction,
      road: inst.street_name || '',
      distance_m,
      duration_s,
      action,
      walk_type: 0, // GH 没有 walk_type
      coords: [],    // GH instructions 不直接给每段坐标
    });

    // 拐点：非直行的 step
    if (sign !== 0 && sign !== 4) {
      // GH 的 interval [from, to] 指向 points 数组的索引
      if (inst.interval && path.points?.coordinates) {
        const fromIdx = inst.interval[0];
        if (fromIdx < path.points.coordinates.length) {
          waypoints.push(path.points.coordinates[fromIdx]);
        }
      }
    }
  }

  // 解码完整路线坐标
  const coords = path.points_encoded
    ? polyline.decodePolyline(path.points.encoded_polyline || '')
    : (path.points?.coordinates || []);

  return {
    engine: 'graphhopper',
    distance_m: path.distance || 0,
    duration_s: (path.time || 0) / 1000,
    steps,
    waypoints,
    coords,
    polyline: path.points?.encoded_polyline || '',
  };
}

/**
 * GH sign → 统一 action 字符串
 */
function signToAction(sign) {
  const map = {
    '-3': 'sharp-left',
    '-2': 'turn-left',
    '-1': 'slight-left',
    '0': 'straight',
    '1': 'slight-right',
    '2': 'turn-right',
    '3': 'sharp-right',
    '4': 'arrive',
  };
  return map[String(sign)] || 'straight';
}

module.exports = { getWalkingRoute };
