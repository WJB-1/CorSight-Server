/**
 * 视野扇区服务
 *
 * 将 lib/geo.js 的纯函数封装为业务接口：
 * 输入图片元数据（bearing + fov + 坐标），输出用于 OSM 检索的扇形多边形。
 */

const geo = require('../lib/geo');

/** 默认扇形半径（米），覆盖人行道宽度 */
const DEFAULT_RADIUS_M = 50;

/** 多边形边界点数（越大多边形越平滑，Overpass 查询越慢） */
const DEFAULT_STEPS = 12;

/**
 * 计算单张图片的视野扇区
 *
 * @param {number} lon - 采集点经度
 * @param {number} lat - 采集点纬度
 * @param {number} bearing - 拍摄方位角（度）
 * @param {number} fov - 水平视场角（度）
 * @param {number} [radiusM] - 扇形半径（米）
 * @returns {{ polygon: Array<[number,number]>, center: [number,number], bearing: number, fov: number, radius: number }}
 */
function computeSector(lon, lat, bearing, fov, radiusM) {
  const r = radiusM || DEFAULT_RADIUS_M;
  const polygon = geo.computeViewSector(lon, lat, bearing, fov, r, DEFAULT_STEPS);

  return {
    polygon,
    center: [lon, lat],
    bearing,
    fov,
    radius: r,
  };
}

/**
 * 计算某张图片在给定行进方向上是否可见
 * 用于 RAG 路线预览时过滤后方的标签
 *
 * @param {number} routeBearing - 用户行进方向（度）
 * @param {number} imageBearing - 图片拍摄方位角（度）
 * @param {number} imageFov - 图片视场角（度）
 * @returns {boolean}
 */
function isVisibleFromRoute(routeBearing, imageBearing, imageFov) {
  return geo.isBearingInSector(routeBearing, imageBearing, imageFov);
}

module.exports = {
  computeSector,
  isVisibleFromRoute,
};
