/**
 * 坐标系转换工具（前端 ES module）
 *
 * 从 backend/lib/coordTransform.js 移植，仅保留前端需要的 WGS-84 → GCJ-02 转换。
 *
 * 使用时机：
 *   高德底图 = GCJ-02 坐标系 → 所有叠加数据需要从 WGS-84 转为 GCJ-02
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
 * WGS-84 → GCJ-02
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} [lng, lat] in GCJ-02
 */
export function wgs84ToGcj02(lng, lat) {
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
