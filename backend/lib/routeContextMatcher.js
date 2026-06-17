/**
 * 路线步骤匹配工具（纯函数）
 *
 * 从 ragRetrievalService 中提取。
 * 在路线 steps 中找到距离给定坐标最近的 step。
 */

const geo = require('./geo');

/**
 * 找到坐标对应的最近路线 step
 * @param {[number,number]} coord - [lng, lat]
 * @param {Array} steps - 路线步骤（含 coords 数组）
 * @returns {{found, instruction, road, action, walk_type, distance_m}}
 */
function retrieveRouteContext(coord, steps) {
  if (!steps || steps.length === 0) {
    return { found: false, instruction: '', road: '', action: '', walk_type: 0, distance_m: 0 };
  }

  let nearestStep = steps[0];
  let minDist = Infinity;

  for (const step of steps) {
    if (!step.coords || step.coords.length === 0) continue;
    for (const sc of step.coords) {
      const d = geo.haversineDistance(coord, sc);
      if (d < minDist) {
        minDist = d;
        nearestStep = step;
      }
    }
  }

  return {
    found: true,
    instruction: nearestStep.instruction || '',
    road: nearestStep.road || '',
    action: nearestStep.action || '',
    walk_type: nearestStep.walk_type || 0,
    distance_m: nearestStep.distance_m || 0,
  };
}

module.exports = { retrieveRouteContext };
