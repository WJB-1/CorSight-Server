/**
 * 坐标系转换工具（纯函数，无副作用）
 *
 * 支持 GCJ-02 ↔ WGS-84 双向转换。
 * BD-09 需要先转 GCJ-02 再转 WGS-84（两步）。
 *
 * 使用时机（应用层按需转换，DB 存原始坐标）：
 *   MapLibre/OSM 查询 → 需要 WGS-84
 *   高德路线 API      → 需要 GCJ-02
 *   GraphHopper       → 需要 WGS-84
 */

// Krasovsky 1940 椭球参数
const A = 6378245.0;
const EE = 0.00669342162296594;

function outOfChina(lng, lat) {
  return !(72.004 <= lng && lng <= 137.8347 && 0.8293 <= lat && lat <= 55.8271);
}

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320.0 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * GCJ-02 → WGS-84
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} [lng, lat]
 */
function gcj02ToWgs84(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dlat = transformLat(lng - 105.0, lat - 35.0);
  let dlng = transformLng(lng - 105.0, lat - 35.0);

  const radlat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radlat);
  magic = 1 - EE * magic * magic;
  const sqrtmagic = Math.sqrt(magic);

  dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * Math.PI);
  dlng = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * Math.PI);

  return [lng - dlng, lat - dlat];
}

/**
 * WGS-84 → GCJ-02
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} [lng, lat]
 */
function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dlat = transformLat(lng - 105.0, lat - 35.0);
  let dlng = transformLng(lng - 105.0, lat - 35.0);

  const radlat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radlat);
  magic = 1 - EE * magic * magic;
  const sqrtmagic = Math.sqrt(magic);

  dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * Math.PI);
  dlng = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * Math.PI);

  return [lng + dlng, lat + dlat];
}

/**
 * 将任意坐标转为 WGS-84（用于 MapLibre/OSM 查询）
 * @param {number} lng
 * @param {number} lat
 * @param {string} crs - 'WGS84' | 'GCJ02' | 'BD09'
 * @returns {[number, number]} [lng, lat] WGS-84
 */
function toWgs84(lng, lat, crs) {
  if (crs === 'WGS84') return [lng, lat];
  if (crs === 'GCJ02') return gcj02ToWgs84(lng, lat);
  // BD09 → GCJ02 → WGS84
  if (crs === 'BD09') {
    const [gLng, gLat] = bd09ToGcj02(lng, lat);
    return gcj02ToWgs84(gLng, gLat);
  }
  return [lng, lat]; // 未知坐标系，原样返回
}

/**
 * 将任意坐标转为 GCJ-02（用于高德 API）
 * @param {number} lng
 * @param {number} lat
 * @param {string} crs - 'WGS84' | 'GCJ02' | 'BD09'
 * @returns {[number, number]} [lng, lat] GCJ-02
 */
function toGcj02(lng, lat, crs) {
  if (crs === 'GCJ02') return [lng, lat];
  if (crs === 'WGS84') return wgs84ToGcj02(lng, lat);
  if (crs === 'BD09') return bd09ToGcj02(lng, lat);
  return [lng, lat];
}

/**
 * BD-09 → GCJ-02
 */
function bd09ToGcj02(lng, lat) {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000.0 / 180.0);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

module.exports = {
  gcj02ToWgs84,
  wgs84ToGcj02,
  bd09ToGcj02,
  toWgs84,
  toGcj02,
};
