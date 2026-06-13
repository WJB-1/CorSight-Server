/**
 * OSM 元素检索服务
 *
 * 在给定扇形多边形内查找行人相关的 OSM 元素。
 *
 * 实现方式：调用 Python 子进程脚本进行本地 OSM 扫描。
 * 首次调用时会加载 workspace.osm（3.2GB，约 7-8 分钟），
 * 后续调用结果会被缓存（基于多边形 hash）。
 *
 * 后续可选：切换到 Overpass API 或 PostGIS。
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const config = require('../config/envConfig');

const execFileAsync = promisify(execFile);
const osmConfig = config.osm;

// ── 结果缓存（避免重复查询同一区域） ─────────────
const lookupCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * 在扇形多边形内检索 OSM 元素
 *
 * @param {Array<[number,number]>} polygon - 扇形多边形坐标 [[lng,lat], ...]
 * @returns {Promise<Array<{osm_id, osm_type, tags}>>}
 */
async function lookupInPolygon(polygon) {
  const cacheKey = polygonToKey(polygon);
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey);
  }

  const osmFile = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const scriptPath = path.join(__dirname, '..', 'scripts', 'osm_lookup.py');

  const polygonStr = JSON.stringify(polygon);

  try {
    const { stdout, stderr } = await execFileAsync(
      osmConfig.PYTHON_PATH,
      [scriptPath, '--osm-file', osmFile, '--polygon', polygonStr],
      { timeout: 600000 } // 10 分钟超时（首次加载慢）
    );

    if (stderr) {
      console.warn(`[OsmLookup] Python stderr: ${stderr.split('\n').slice(-3).join('\n')}`);
    }

    // 解析最后一行 JSON
    const lines = stdout.trim().split('\n');
    let result;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        result = JSON.parse(lines[i]);
        break;
      } catch (_) { /* skip */ }
    }

    const elements = (result && result.elements) || [];

    // 缓存结果
    if (lookupCache.size >= CACHE_MAX_SIZE) {
      const firstKey = lookupCache.keys().next().value;
      lookupCache.delete(firstKey);
    }
    lookupCache.set(cacheKey, elements);

    return elements;
  } catch (err) {
    console.error(`[OsmLookup] Python script failed:`, err.message);
    return [];
  }
}

/**
 * 查找坐标最近的 way（通过 Python 脚本）
 * @param {number} lon
 * @param {number} lat
 * @param {number} [maxResults=5]
 * @returns {Promise<Array>}
 */
async function findNearestWays(lon, lat, maxResults = 5) {
  const osmFile = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const scriptPath = path.join(__dirname, '..', 'scripts', 'osm_lookup.py');

  try {
    const { stdout } = await execFileAsync(
      osmConfig.PYTHON_PATH,
      [scriptPath, '--osm-file', osmFile, '--center', `${lon},${lat}`, '--max-results', String(maxResults)],
      { timeout: 600000 }
    );

    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const result = JSON.parse(lines[i]);
        return result.elements || [];
      } catch (_) { /* skip */ }
    }
    return [];
  } catch (err) {
    console.error(`[OsmLookup] findNearestWays failed:`, err.message);
    return [];
  }
}

/**
 * 生成多边形的缓存 key（取前4位精度，避免浮点误差）
 */
function polygonToKey(polygon) {
  return polygon
    .map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`)
    .join('|');
}

module.exports = {
  lookupInPolygon,
  findNearestWays,
};
