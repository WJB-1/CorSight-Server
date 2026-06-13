/**
 * RAG 检索服务（三层数据独立检索 + 融合）
 *
 * 沿路线采样 → 每个采样点并行查三路数据 → 融合为上下文
 *
 * 三路检索各自独立封装：
 * 1. retrieveVlmTags — MongoDB semantic_tags（VLM 富标签）
 * 2. retrieveOsmTags — 本地 OSM 数据（原始标签）
 * 3. retrieveRouteContext — 高德/GH 路线步骤（语义上下文）
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const SemanticTag = require('../models/SemanticTag');
const osmLookupService = require('./osmLookupService');
const viewSectorService = require('./viewSectorService');
const geo = require('../lib/geo');
const config = require('../config/envConfig');

const execFileAsync = promisify(execFile);

// ── 第一路：VLM 富标签检索 ───────────────────────

/**
 * 从 MongoDB 检索采样点附近的 VLM 富标签
 * 按行进方向筛选 images[] 中前方扇区的标签
 */
async function retrieveVlmTags(coord, routeBearing, radiusM = 100) {
  const [lng, lat] = coord;

  try {
    const tag = await SemanticTag.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusM,
        },
      },
      status: { $in: ['pending', 'patched'] },
    }).lean();

    if (!tag || !tag.images || tag.images.length === 0) {
      return { found: false, tags: {}, description: '', confidence: 0, point_id: null };
    }

    // 按行进方向筛选前方扇区内的图片标签
    const relevantImages = tag.images.filter((img) => {
      return viewSectorService.isVisibleFromRoute(routeBearing, img.bearing, img.fov || 90);
    });

    if (relevantImages.length === 0) {
      return {
        found: true,
        tags: tag.merged_osm_tags || {},
        description: tag.merged_description || '',
        confidence: 0,
        point_id: tag.point_id,
      };
    }

    const mergedTags = {};
    const descriptions = [];
    let totalConfidence = 0;
    let count = 0;

    for (const img of relevantImages) {
      if (img.osm_tags) Object.assign(mergedTags, img.osm_tags);
      if (img.description) descriptions.push(img.description);
      if (img.confidence) { totalConfidence += img.confidence; count++; }
    }

    return {
      found: true,
      tags: mergedTags,
      description: descriptions.join('；'),
      confidence: count > 0 ? totalConfidence / count : 0,
      point_id: tag.point_id,
    };
  } catch (err) {
    console.warn(`[RAG] VLM retrieval error at (${lng},${lat}):`, err.message);
    return { found: false, tags: {}, description: '', confidence: 0, point_id: null };
  }
}

// ── 第二路：OSM 原始标签检索 ──────────────────────

/**
 * 对整条路线做一次性的 OSM 裁剪 + 全量查询
 *
 * 原理：不逐点启动 Python 进程扫描 280MB 文件，
 * 而是先用 osmium extract 裁出路线附近的子集（几 MB），
 * 然后启动一个 Python 进程一次性查询所有采样点。
 *
 * @param {Array<[number,number]>} sampleCoords — 所有采样点坐标
 * @param {number} [bufferM=100] — 路线两侧扩展距离（米）
 * @returns {Promise<Map<string, Array>>} coordKey → elements
 */
async function retrieveOsmForRoute(sampleCoords, bufferM = 100) {
  if (!sampleCoords || sampleCoords.length === 0) return new Map();

  // 1. 计算所有采样点的 bbox + buffer
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of sampleCoords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const deltaLon = bufferM / (111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180));
  const deltaLat = bufferM / 111320;
  minLng -= deltaLon; maxLng += deltaLon;
  minLat -= deltaLat; maxLat += deltaLat;

  // 2. osmium extract 裁剪路线附近的 OSM 子集
  const osmConfig = config.osm;
  const srcFile = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const tmpDir = path.join(osmConfig.OSM_DATA_DIR, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const extractFile = path.join(tmpDir, `route_extract_${Date.now()}.osm`);

  try {
    console.log(`[RAG-OSM] Extracting bbox [${minLng.toFixed(4)},${minLat.toFixed(4)},${maxLng.toFixed(4)},${maxLat.toFixed(4)}]`);
    await execFileAsync(osmConfig.OSMIUM_PATH, [
      'extract', '--bbox', `${minLng},${minLat},${maxLng},${maxLat}`,
      '--strategy', 'complete_ways',
      srcFile, '-o', extractFile,
    ]);

    const stat = fs.statSync(extractFile);
    console.log(`[RAG-OSM] Extracted: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
  } catch (err) {
    console.error(`[RAG-OSM] Extract failed:`, err.message);
    return new Map();
  }

  // 3. 一次 Python 调用查询所有采样点
  const queryCoords = sampleCoords.map(([lng, lat]) => ({ lng, lat, radius: 50 }));
  const scriptPath = path.join(__dirname, '..', 'scripts', 'osm_lookup.py');

  try {
    const { stdout } = await execFileAsync(
      osmConfig.PYTHON_PATH,
      [scriptPath, '--osm-file', extractFile, '--batch-query', JSON.stringify(queryCoords)],
      { timeout: 120000 }
    );

    // 解析结果
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const result = JSON.parse(lines[i]);
        // 清理临时文件
        try { fs.unlinkSync(extractFile); } catch (_) {}

        // 返回 Map: "lng,lat" → elements
        const resultMap = new Map();
        if (result.results) {
          for (const [key, elems] of Object.entries(result.results)) {
            resultMap.set(key, elems);
          }
        }
        return resultMap;
      } catch (_) { /* skip */ }
    }
  } catch (err) {
    console.error(`[RAG-OSM] Batch query failed:`, err.message);
  }

  // 清理临时文件
  try { fs.unlinkSync(extractFile); } catch (_) {}
  return new Map();
}

// ── 第三路：高德/GH 路线语义 ──────────────────────

/**
 * 从路线 steps 中找到该采样点对应的 step 上下文
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

// ── 融合：对单个采样点合并三路结果 ────────────────

function mergeSampleContext(sample, vlmResult, osmElements, routeContext) {
  return {
    coord: sample.coord,
    bearing: sample.bearing,
    isWaypoint: sample.isWaypoint,
    vlm: vlmResult,
    osm: { found: osmElements.length > 0, elements: osmElements },
    route: routeContext,
  };
}

// ── 主入口：沿路线批量检索 ────────────────────────

/**
 * 沿路线采样点批量三层检索
 *
 * @param {Array<{ coord: [number,number], bearing: number, isWaypoint: boolean }>} samples
 * @param {Array} steps — 路线 steps
 * @returns {Promise<Array<object>>} 每个采样点的融合上下文
 */
async function retrieveForRoute(samples, steps) {
  console.log(`[RAG] Retrieving context for ${samples.length} sample points...`);
  const t0 = Date.now();

  // 并行启动三路检索
  const [osmResults] = await Promise.all([
    // OSM：一次性裁剪 + 批量查询
    retrieveOsmForRoute(samples.map((s) => s.coord)),
    // VLM：逐点 MongoDB 查询（快速，$near 索引）
    // 和 Route：纯内存计算
    // 这两个在下面逐点处理
  ]);

  // 逐点融合
  const results = [];
  for (const sample of samples) {
    const coordKey = `${sample.coord[0].toFixed(6)},${sample.coord[1].toFixed(6)}`;

    // VLM：逐点查询（MongoDB $near，毫秒级）
    const vlmResult = await retrieveVlmTags(sample.coord, sample.bearing);

    // OSM：从预查询结果中取
    const osmElements = osmResults.get(coordKey) || [];

    // Route：从 steps 中匹配
    const routeContext = retrieveRouteContext(sample.coord, steps);

    results.push(mergeSampleContext(sample, vlmResult, osmElements, routeContext));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const vlmHits = results.filter((r) => r.vlm.found).length;
  const osmHits = results.filter((r) => r.osm.found).length;
  console.log(`[RAG] Done: ${results.length} points, VLM: ${vlmHits}, OSM: ${osmHits} (${elapsed}s)`);

  return results;
}

module.exports = {
  retrieveVlmTags,
  retrieveOsmForRoute,
  retrieveRouteContext,
  retrieveForRoute,
};
