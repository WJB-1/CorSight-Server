/**
 * 区块网格管理器 - Spatial Grid Manager
 * 实现轻量级 Web Mercator 瓦片算法 (Slippy Map Tilenames)
 * 默认 Zoom Level 为 16 (约 500m x 500m 区块)
 */

const DEFAULT_ZOOM = 16;
const EARTH_RADIUS = 6378137; // 地球半径（米）
const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;

/**
 * 将度分秒格式转换为十进制度数
 * @param dms 度分秒字符串，如 "23°8'11''"
 * @returns 十进制度数
 */
export function dmsToDecimal(dms: string | number): number {
  // 如果已经是数字，直接返回
  if (typeof dms === 'number') {
    return dms;
  }
  const regex = /(\d+)°(\d+)'([\d.]+)''/;
  const match = String(dms).match(regex);
  if (!match) {
    const num = parseFloat(dms);
    return isNaN(num) ? 0 : num;
  }
  const degrees = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * 将十进制度数转换为弧度
 * @param deg 角度
 * @returns 弧度
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 将弧度转换为十进制度数
 * @param rad 弧度
 * @returns 角度
 */
function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * 根据经纬度和缩放级别计算瓦片坐标
 * @param lat 纬度（十进制度数）
 * @param lon 经度（十进制度数）
 * @param zoom 缩放级别，默认为 16
 * @returns 瓦片坐标对象，包含 x, y, z 和 chunkId
 */
export function getTile(
  lat: number,
  lon: number,
  zoom: number = DEFAULT_ZOOM
): { x: number; y: number; z: number; chunkId: string } {
  // 确保经纬度是数字
  const latitude = typeof lat === 'string' ? dmsToDecimal(lat) : lat;
  const longitude = typeof lon === 'string' ? dmsToDecimal(lon) : lon;

  // Web Mercator 投影计算
  const latRad = degToRad(latitude);
  const n = Math.pow(2, zoom);
  
  const x = Math.floor((longitude + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
  );

  const chunkId = `${zoom}_${x}_${y}`;

  return { x, y, z: zoom, chunkId };
}

/**
 * 根据瓦片坐标，反向计算出该区块的真实地理边界
 * @param x 瓦片 X 坐标
 * @param y 瓦片 Y 坐标
 * @param z 缩放级别
 * @returns 边界框数组 [minLon, minLat, maxLon, maxLat]（先经后纬，南西为 min）
 */
export function getTileBoundingBox(
  x: number,
  y: number,
  z: number
): [number, number, number, number] {
  const n = Math.pow(2, z);

  // 计算经度范围
  const minLon = x / n * 360 - 180;
  const maxLon = (x + 1) / n * 360 - 180;

  // 计算纬度范围（Web Mercator 反投影）
  const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));

  const minLat = radToDeg(minLatRad);
  const maxLat = radToDeg(maxLatRad);

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * 计算当前坐标所在的中心区块，以及周围一圈的 8 个区块（九宫格）
 * @param lat 纬度（十进制度数）
 * @param lon 经度（十进制度数）
 * @param zoom 缩放级别，默认为 16
 * @returns chunkId 的数组，用于前端视野预加载
 */
export function getCurrentAndSurroundingChunks(
  lat: number,
  lon: number,
  zoom: number = DEFAULT_ZOOM
): string[] {
  const centerTile = getTile(lat, lon, zoom);
  const { x, y, z } = centerTile;

  const chunks: string[] = [];

  // 九宫格：中心 + 周围 8 个方向
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tileX = x + dx;
      const tileY = y + dy;

      // 边界检查：确保瓦片坐标在有效范围内
      const maxTile = Math.pow(2, zoom);
      if (tileX >= 0 && tileX < maxTile && tileY >= 0 && tileY < maxTile) {
        chunks.push(`${zoom}_${tileX}_${tileY}`);
      }
    }
  }

  return chunks;
}

/**
 * 根据 chunkId 解析瓦片坐标
 * @param chunkId 格式为 "{z}_{x}_{y}"
 * @returns 瓦片坐标对象
 */
export function parseChunkId(chunkId: string): { x: number; y: number; z: number } | null {
  const parts = chunkId.split('_');
  if (parts.length !== 3) return null;

  const z = parseInt(parts[0], 10);
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) return null;

  return { x, y, z };
}

/**
 * 计算两个坐标点之间的距离（米）
 * 使用 Haversine 公式
 * @param lat1 第一个点纬度
 * @param lon1 第一个点经度
 * @param lat2 第二个点纬度
 * @param lon2 第二个点经度
 * @returns 距离（米）
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // 地球半径（米）
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * 检查坐标是否跨越了瓦片边界
 * @param lat1 之前纬度
 * @param lon1 之前经度
 * @param lat2 当前纬度
 * @param lon2 当前经度
 * @param zoom 缩放级别
 * @returns 是否跨越了边界
 */
export function hasCrossedTileBoundary(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  zoom: number = DEFAULT_ZOOM
): boolean {
  const tile1 = getTile(lat1, lon1, zoom);
  const tile2 = getTile(lat2, lon2, zoom);

  return tile1.chunkId !== tile2.chunkId;
}
