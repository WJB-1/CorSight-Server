/**
 * 地理计算工具库（纯函数，无副作用）
 *
 * - toRadians / toDegrees
 * - haversineDistance — 两点距离（米）
 * - calculateBearing — 方位角（度）
 * - computeViewSector — 视野扇区多边形坐标
 * - isBearingInSector — 判断方向是否在扇区内
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return deg * DEG_TO_RAD;
}

function toDegrees(rad) {
  return rad * RAD_TO_DEG;
}

/**
 * Haversine 距离（米）
 * @param {[number,number]} c1 - [lng, lat]
 * @param {[number,number]} c2 - [lng, lat]
 * @returns {number} 距离（米）
 */
function haversineDistance(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * 从 c1 到 c2 的方位角（度，0=北，顺时针）
 * @param {[number,number]} c1 - [lng, lat]
 * @param {[number,number]} c2 - [lng, lat]
 * @returns {number} 0~360
 */
function calculateBearing(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;

  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * 计算视野扇区多边形
 *
 * 输入：采集点坐标、方位角、视场角、半径
 * 输出：扇形边界的经纬度坐标数组（可用于 Overpass 查询或 shapely 多边形）
 *
 * @param {number} lon - 经度
 * @param {number} lat - 纬度
 * @param {number} bearing - 方位角（度，0=北）
 * @param {number} fov - 水平视场角（度）
 * @param {number} radiusMeters - 扇形半径（米）
 * @param {number} [steps=12] - 边界点数量（越多越平滑）
 * @returns {Array<[number,number]>} 多边形坐标数组 [[lng,lat], ...]，首尾闭合
 */
function computeViewSector(lon, lat, bearing, fov, radiusMeters, steps = 12) {
  const halfFov = fov / 2;
  const startAngle = bearing - halfFov;
  const angleStep = fov / steps;

  // 中心点（度→米的近似换算因子）
  const latRad = toRadians(lat);
  const metersPerDegLat = EARTH_RADIUS_M * DEG_TO_RAD;
  const metersPerDegLon = metersPerDegLat * Math.cos(latRad);

  const points = [];

  // 中心点作为第一个顶点
  points.push([lon, lat]);

  // 扇形弧上的点
  for (let i = 0; i <= steps; i++) {
    const angleDeg = startAngle + i * angleStep;
    const angleRad = toRadians(angleDeg);

    // 北为 0°，顺时针：dx = sin(angle), dy = cos(angle)
    const dx = (radiusMeters * Math.sin(angleRad)) / metersPerDegLon;
    const dy = (radiusMeters * Math.cos(angleRad)) / metersPerDegLat;

    points.push([lon + dx, lat + dy]);
  }

  // 闭合多边形
  points.push([lon, lat]);

  return points;
}

/**
 * 判断目标方位角是否在扇区内
 *
 * @param {number} targetBearing - 目标方向（度）
 * @param {number} sectorCenter - 扇区中心方位角（度）
 * @param {number} sectorFov - 扇区视场角（度）
 * @returns {boolean}
 */
function isBearingInSector(targetBearing, sectorCenter, sectorFov) {
  const halfFov = sectorFov / 2;

  // 计算两个角度的最小差值（处理 0°/360° 边界）
  let diff = targetBearing - sectorCenter;
  diff = ((diff + 180) % 360 + 360) % 360 - 180;

  return Math.abs(diff) <= halfFov;
}

module.exports = {
  toRadians,
  toDegrees,
  haversineDistance,
  calculateBearing,
  computeViewSector,
  isBearingInSector,
};
