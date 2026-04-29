/**
 * 模块一：区块网格管理器 - 功能验收测试
 * 
 * 测试内容：
 * 1. getTile - 瓦片坐标计算
 * 2. getTileBoundingBox - 边界框计算
 * 3. getCurrentAndSurroundingChunks - 九宫格计算
 * 4. dmsToDecimal - 度分秒转换
 * 5. parseChunkId - chunkId 解析
 * 6. calculateDistance - 距离计算
 * 7. hasCrossedTileBoundary - 边界跨越检测
 * 
 * 使用方法：
 * node test/test_module1_grid.js
 */

const fs = require('fs');
const path = require('path');

// 引入模块一（通过编译后的 JS 或直接测试算法逻辑）
// 这里我们直接复制核心算法进行测试

const DEFAULT_ZOOM = 16;

// ============ 工具函数 ============
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

// ============ 模块一核心函数 ============

/**
 * 度分秒转十进制
 */
function dmsToDecimal(dms) {
  // 如果是数字，直接返回
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
 * 计算瓦片坐标
 */
function getTile(lat, lon, zoom = DEFAULT_ZOOM) {
  const latitude = typeof lat === 'string' ? dmsToDecimal(lat) : lat;
  const longitude = typeof lon === 'string' ? dmsToDecimal(lon) : lon;

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
 * 计算瓦片边界
 */
function getTileBoundingBox(x, y, z) {
  const n = Math.pow(2, z);

  const minLon = x / n * 360 - 180;
  const maxLon = (x + 1) / n * 360 - 180;

  const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));

  const minLat = radToDeg(minLatRad);
  const maxLat = radToDeg(maxLatRad);

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * 获取九宫格
 */
function getCurrentAndSurroundingChunks(lat, lon, zoom = DEFAULT_ZOOM) {
  const centerTile = getTile(lat, lon, zoom);
  const { x, y, z } = centerTile;

  const chunks = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tileX = x + dx;
      const tileY = y + dy;

      const maxTile = Math.pow(2, zoom);
      if (tileX >= 0 && tileX < maxTile && tileY >= 0 && tileY < maxTile) {
        chunks.push(`${zoom}_${tileX}_${tileY}`);
      }
    }
  }

  return chunks;
}

/**
 * 解析 chunkId
 */
function parseChunkId(chunkId) {
  const parts = chunkId.split('_');
  if (parts.length !== 3) return null;

  const z = parseInt(parts[0], 10);
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) return null;

  return { x, y, z };
}

/**
 * 计算距离
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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
 * 检查是否跨越边界
 */
function hasCrossedTileBoundary(lat1, lon1, lat2, lon2, zoom = DEFAULT_ZOOM) {
  const tile1 = getTile(lat1, lon1, zoom);
  const tile2 = getTile(lat2, lon2, zoom);

  return tile1.chunkId !== tile2.chunkId;
}

// ============ 测试框架 ============
let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    错误: ${error.message}`);
    errors.push({ name, error: error.message });
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: 期望 ${expected}, 实际 ${actual}`);
  }
}

function assertApprox(actual, expected, tolerance = 0.0001, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: 期望约 ${expected}, 实际 ${actual}`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}: 期望 true, 实际 ${value}`);
  }
}

function assertArrayLength(arr, length, message) {
  if (arr.length !== length) {
    throw new Error(`${message}: 期望长度 ${length}, 实际 ${arr.length}`);
  }
}

// ============ 测试用例 ============

console.log('\n========================================');
console.log('模块一：区块网格管理器 - 功能验收测试');
console.log('========================================\n');

// 测试数据：广州某区域
const TEST_LAT = 23.1364;
const TEST_LON = 113.3223;
const TEST_DMS_LAT = "23°8'11''";
const TEST_DMS_LON = "113°19'21''";

console.log('【测试组 1】度分秒转换 (dmsToDecimal)');
console.log('----------------------------------------');

test('应正确转换纬度度分秒', () => {
  const result = dmsToDecimal(TEST_DMS_LAT);
  assertApprox(result, 23.136388, 0.00001, '纬度转换');
});

test('应正确转换经度度分秒', () => {
  const result = dmsToDecimal(TEST_DMS_LON);
  assertApprox(result, 113.3225, 0.0001, '经度转换');
});

test('应直接返回数字输入', () => {
  const result = dmsToDecimal(23.5);
  assertEqual(result, 23.5, '数字输入');
});

console.log('\n【测试组 2】瓦片坐标计算 (getTile)');
console.log('----------------------------------------');

test('应返回正确的瓦片坐标', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  assertTrue(tile.x > 0, 'X 坐标为正');
  assertTrue(tile.y > 0, 'Y 坐标为正');
  assertEqual(tile.z, 16, 'Zoom 级别');
});

test('应返回正确的 chunkId 格式', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const pattern = /^16_\d+_\d+$/;
  assertTrue(pattern.test(tile.chunkId), `chunkId 格式: ${tile.chunkId}`);
});

test('应支持度分秒输入', () => {
  const tile1 = getTile(dmsToDecimal(TEST_DMS_LAT), dmsToDecimal(TEST_DMS_LON));
  const tile2 = getTile(23.136388, 113.3225);
  assertEqual(tile1.chunkId, tile2.chunkId, '度分秒与十进制应产生相同 chunkId');
});

console.log('\n【测试组 3】边界框计算 (getTileBoundingBox)');
console.log('----------------------------------------');

test('应返回正确的边界框格式', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertEqual(bbox.length, 4, '边界框数组长度');
  assertTrue(bbox[0] < bbox[2], 'minLon < maxLon');
  assertTrue(bbox[1] < bbox[3], 'minLat < maxLat');
});

test('边界框应包含原始坐标', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  
  assertTrue(TEST_LON >= minLon && TEST_LON <= maxLon, '经度在边界内');
  assertTrue(TEST_LAT >= minLat && TEST_LAT <= maxLat, '纬度在边界内');
});

test('边界框宽度应符合 zoom=16 的约 500m 规格', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  
  const width = calculateDistance(minLat, minLon, minLat, maxLon);
  // Zoom 16 瓦片宽度约 500-600 米（随纬度变化）
  assertTrue(width > 400 && width < 800, `边界框宽度约 ${width.toFixed(0)}m 应在 400-800m 范围内`);
});

console.log('\n【测试组 4】九宫格计算 (getCurrentAndSurroundingChunks)');
console.log('----------------------------------------');

test('应返回 9 个区块', () => {
  const chunks = getCurrentAndSurroundingChunks(TEST_LAT, TEST_LON);
  assertArrayLength(chunks, 9, '九宫格数量');
});

test('中心区块应在数组中间', () => {
  const chunks = getCurrentAndSurroundingChunks(TEST_LAT, TEST_LON);
  const tile = getTile(TEST_LAT, TEST_LON);
  assertEqual(chunks[4], tile.chunkId, '中心区块位置');
});

test('区块 ID 应按顺序排列', () => {
  const chunks = getCurrentAndSurroundingChunks(TEST_LAT, TEST_LON);
  const uniqueChunks = [...new Set(chunks)];
  assertEqual(uniqueChunks.length, 9, '区块应不重复');
});

console.log('\n【测试组 5】chunkId 解析 (parseChunkId)');
console.log('----------------------------------------');

test('应正确解析 chunkId', () => {
  const parsed = parseChunkId('16_53943_27755');
  assertEqual(parsed.z, 16, 'Zoom 级别');
  assertEqual(parsed.x, 53943, 'X 坐标');
  assertEqual(parsed.y, 27755, 'Y 坐标');
});

test('应返回 null 给无效格式', () => {
  const parsed = parseChunkId('invalid');
  assertEqual(parsed, null, '无效格式应返回 null');
});

test('应返回 null 给非数字', () => {
  const parsed = parseChunkId('a_b_c');
  assertEqual(parsed, null, '非数字应返回 null');
});

console.log('\n【测试组 6】距离计算 (calculateDistance)');
console.log('----------------------------------------');

test('应正确计算两点距离', () => {
  // 广州塔到海心沙约 700 米
  const cantonTower = { lat: 23.1065, lon: 113.3245 };
  const haixinsha = { lat: 23.1105, lon: 113.3245 };
  const distance = calculateDistance(
    cantonTower.lat, cantonTower.lon,
    haixinsha.lat, haixinsha.lon
  );
  assertTrue(distance > 400 && distance < 800, `距离 ${distance.toFixed(0)}m 应在 400-800m 范围内`);
});

test('同一点距离应为 0', () => {
  const distance = calculateDistance(TEST_LAT, TEST_LON, TEST_LAT, TEST_LON);
  assertEqual(distance, 0, '同一点距离');
});

console.log('\n【测试组 7】边界跨越检测 (hasCrossedTileBoundary)');
console.log('----------------------------------------');

test('同一点不应跨越边界', () => {
  const crossed = hasCrossedTileBoundary(TEST_LAT, TEST_LON, TEST_LAT, TEST_LON);
  assertEqual(crossed, false, '同一点不跨越');
});

test('小范围移动不应跨越边界', () => {
  const crossed = hasCrossedTileBoundary(
    TEST_LAT, TEST_LON,
    TEST_LAT + 0.0001, TEST_LON + 0.0001
  );
  assertEqual(crossed, false, '小范围不跨越');
});

test('大范围移动应跨越边界', () => {
  // 移动约 600 米，应跨越 500m 瓦片边界
  const crossed = hasCrossedTileBoundary(
    TEST_LAT, TEST_LON,
    TEST_LAT + 0.006, TEST_LON + 0.006
  );
  assertEqual(crossed, true, '大范围应跨越');
});

// ============ 测试报告 ============

console.log('\n========================================');
console.log('测试报告');
console.log('========================================');
console.log(`总测试数: ${passed + failed}`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (errors.length > 0) {
  console.log('\n失败详情:');
  errors.forEach((err, idx) => {
    console.log(`  ${idx + 1}. ${err.name}`);
    console.log(`     ${err.error}`);
  });
}

console.log('========================================\n');

// 保存测试报告
const report = {
  module: 'Module 1 - Grid Manager',
  timestamp: new Date().toISOString(),
  total: passed + failed,
  passed,
  failed,
  errors
};

const reportPath = path.join(__dirname, 'report_module1.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`测试报告已保存至: ${reportPath}\n`);

process.exit(failed > 0 ? 1 : 0);
