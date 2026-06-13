/**
 * 路线服务统一入口
 *
 * 根据 engine 参数分发到高德或 GraphHopper，抹平输出差异。
 */

const amapService = require('./amapService');
const graphhopperRouteService = require('./graphhopperRouteService');

const ENGINES = {
  amap: amapService,
  graphhopper: graphhopperRouteService,
};

/**
 * 获取步行路线
 *
 * @param {{ lng: number, lat: number }} origin
 * @param {{ lng: number, lat: number }} destination
 * @param {string} [engine='amap'] — 'amap' 或 'graphhopper'
 * @returns {Promise<object>} 统一格式路线数据
 */
async function getRoute(origin, destination, engine = 'amap') {
  const service = ENGINES[engine];
  if (!service) {
    throw new Error(`Unknown route engine: ${engine}. Supported: ${Object.keys(ENGINES).join(', ')}`);
  }

  return service.getWalkingRoute(origin, destination);
}

module.exports = { getRoute, ENGINES };
