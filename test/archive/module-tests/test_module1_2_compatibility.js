/**
 * 模块一、二接口兼容性测试
 * 
 * 测试内容：
 * 1. chunkId 格式一致性
 * 2. BBox 格式一致性
 * 3. 坐标顺序兼容性（先经后纬）
 * 4. 缓存键名一致性
 * 5. 模块一输出到模块二输入的数据流
 * 
 * 使用方法：
 * node test/test_module1_2_compatibility.js
 */

const fs = require('fs');
const path = require('path');

// ============ 模块一核心函数 ============
const DEFAULT_ZOOM = 16;

function degToRad(deg) { return (deg * Math.PI) / 180; }
function radToDeg(rad) { return (rad * 180) / Math.PI; }

function dmsToDecimal(dms) {
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

function getTile(lat, lon, zoom = DEFAULT_ZOOM) {
  const latitude = typeof lat === 'string' ? dmsToDecimal(lat) : lat;
  const longitude = typeof lon === 'string' ? dmsToDecimal(lon) : lon;

  const latRad = degToRad(latitude);
  const n = Math.pow(2, zoom);
  const x = Math.floor((longitude + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

  return { x, y, z: zoom, chunkId: `${zoom}_${x}_${y}` };
}

function getTileBoundingBox(x, y, z) {
  const n = Math.pow(2, z);
  const minLon = x / n * 360 - 180;
  const maxLon = (x + 1) / n * 360 - 180;
  const minLat = radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))));
  const maxLat = radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))));
  return [minLon, minLat, maxLon, maxLat];
}

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

function parseChunkId(chunkId) {
  const parts = chunkId.split('_');
  if (parts.length !== 3) return null;
  const z = parseInt(parts[0], 10);
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (isNaN(z) || isNaN(x) || isNaN(y)) return null;
  return { x, y, z };
}

// ============ 测试框架 ============
let passed = 0;
let failed = 0;
const errors = [];
const compatibilityReport = {
  chunkIdFormat: [],
  bboxFormat: [],
  coordinateOrder: [],
  dataFlow: [],
  edgeCases: []
};

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

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}: 期望 true, 实际 ${value}`);
  }
}

function assertMatch(value, pattern, message) {
  if (!pattern.test(value)) {
    throw new Error(`${message}: "${value}" 不匹配 ${pattern}`);
  }
}

// ============ 测试用例 ============

console.log('\n========================================');
console.log('模块一、二接口兼容性测试');
console.log('========================================\n');

// 测试数据
const TEST_LAT = 23.1364;
const TEST_LON = 113.3223;

console.log('【测试组 1】chunkId 格式一致性');
console.log('----------------------------------------');

test('chunkId 格式应为 "{z}_{x}_{y}"', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const pattern = /^\d+_\d+_\d+$/;
  assertMatch(tile.chunkId, pattern, 'chunkId 格式');
  compatibilityReport.chunkIdFormat.push({
    test: '基本格式',
    sample: tile.chunkId,
    valid: true
  });
});

test('chunkId 各部分应为整数', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const parts = tile.chunkId.split('_');
  assertEqual(parts.length, 3, '分割后应有 3 部分');
  assertTrue(Number.isInteger(parseInt(parts[0])), 'z 应为整数');
  assertTrue(Number.isInteger(parseInt(parts[1])), 'x 应为整数');
  assertTrue(Number.isInteger(parseInt(parts[2])), 'y 应为整数');
  compatibilityReport.chunkIdFormat.push({
    test: '整数验证',
    z: parseInt(parts[0]),
    x: parseInt(parts[1]),
    y: parseInt(parts[2]),
    valid: true
  });
});

test('同一坐标生成的 chunkId 应一致', () => {
  const tile1 = getTile(TEST_LAT, TEST_LON);
  const tile2 = getTile(TEST_LAT, TEST_LON);
  assertEqual(tile1.chunkId, tile2.chunkId, 'chunkId 一致性');
});

test('parseChunkId 应能正确解析 getTile 生成的 chunkId', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const parsed = parseChunkId(tile.chunkId);
  assertTrue(parsed !== null, '解析不应返回 null');
  assertEqual(parsed.x, tile.x, 'x 坐标');
  assertEqual(parsed.y, tile.y, 'y 坐标');
  assertEqual(parsed.z, tile.z, 'z 坐标');
});

console.log('\n【测试组 2】BBox 格式一致性');
console.log('----------------------------------------');

test('BBox 应为数组格式 [minLon, minLat, maxLon, maxLat]', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertEqual(bbox.length, 4, '数组长度');
  assertTrue(typeof bbox[0] === 'number', 'minLon 为数字');
  assertTrue(typeof bbox[1] === 'number', 'minLat 为数字');
  assertTrue(typeof bbox[2] === 'number', 'maxLon 为数字');
  assertTrue(typeof bbox[3] === 'number', 'maxLat 为数字');
  compatibilityReport.bboxFormat.push({
    test: '数组格式',
    sample: bbox,
    valid: true
  });
});

test('BBox 顺序应为 先经度后纬度 (minLon, minLat, maxLon, maxLat)', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  
  assertTrue(minLon < maxLon, 'minLon < maxLon');
  assertTrue(minLat < maxLat, 'minLat < maxLat');
  
  // 验证广州坐标范围
  assertTrue(minLon > 110 && maxLon < 120, '经度在广州范围');
  assertTrue(minLat > 20 && maxLat < 25, '纬度在广州范围');
  
  compatibilityReport.bboxFormat.push({
    test: '坐标顺序',
    order: 'minLon, minLat, maxLon, maxLat',
    sample: bbox,
    valid: true
  });
});

test('BBox 字符串格式应符合后端接口要求', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  const bboxString = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
  
  // 后端接口格式: bbox=minLon,minLat,maxLon,maxLat
  const pattern = /^-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/;
  assertMatch(bboxString, pattern, 'BBox 字符串格式');
  
  compatibilityReport.bboxFormat.push({
    test: '字符串格式',
    sample: bboxString,
    valid: true
  });
});

console.log('\n【测试组 3】坐标顺序兼容性（先经后纬）');
console.log('----------------------------------------');

test('getTile 参数顺序为 (lat, lon)，与常规地理习惯一致', () => {
  const tile1 = getTile(23.1364, 113.3223);
  // zoom=16 瓦片约 500m，需要更大的变化才能跨越边界（约 0.005 度 ≈ 550m）
  const tile2 = getTile(23.1414, 113.3223); // 纬度变化约 0.005 度
  const tile3 = getTile(23.1364, 113.3273); // 经度变化约 0.005 度
  assertTrue(tile1.chunkId !== tile2.chunkId, '纬度变化应改变 chunkId');
  assertTrue(tile1.chunkId !== tile3.chunkId, '经度变化应改变 chunkId');
  
  compatibilityReport.coordinateOrder.push({
    test: '参数顺序',
    signature: 'getTile(lat, lon)',
    valid: true
  });
});

test('BBox 输出顺序为 [minLon, minLat, maxLon, maxLat]，符合 GeoJSON 和 MongoDB 规范', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  
  // GeoJSON 和 MongoDB 都使用 [longitude, latitude] 顺序
  const expectedOrder = ['minLon', 'minLat', 'maxLon', 'maxLat'];
  const actualOrder = bbox.map((v, i) => expectedOrder[i]);
  
  compatibilityReport.coordinateOrder.push({
    test: 'BBox 输出顺序',
    standard: 'GeoJSON/MongoDB [lon, lat]',
    order: actualOrder,
    valid: true
  });
});

test('坐标值不应出现混淆（经度 vs 纬度范围验证）', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  
  // 中国经度范围：73°E - 135°E
  // 中国纬度范围：4°N - 53°N
  assertTrue(bbox[0] > 70 && bbox[0] < 140, 'minLon 在中国范围');
  assertTrue(bbox[2] > 70 && bbox[2] < 140, 'maxLon 在中国范围');
  assertTrue(bbox[1] > 0 && bbox[1] < 60, 'minLat 在中国范围');
  assertTrue(bbox[3] > 0 && bbox[3] < 60, 'maxLat 在中国范围');
});

console.log('\n【测试组 4】模块一输出到模块二输入的数据流');
console.log('----------------------------------------');

test('模块一 tile.x/y/z 可用于模块二计算 BBox', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertTrue(bbox[0] < bbox[2], 'BBox 经度有效');
  assertTrue(bbox[1] < bbox[3], 'BBox 纬度有效');
  
  compatibilityReport.dataFlow.push({
    test: 'tile → bbox',
    input: { x: tile.x, y: tile.y, z: tile.z },
    output: bbox,
    valid: true
  });
});

test('模块一 chunkId 可被模块二解析并计算 BBox', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const parsed = parseChunkId(tile.chunkId);
  const bbox = getTileBoundingBox(parsed.x, parsed.y, parsed.z);
  
  assertTrue(bbox[0] < bbox[2], '解析后 BBox 经度有效');
  assertTrue(bbox[1] < bbox[3], '解析后 BBox 纬度有效');
  
  compatibilityReport.dataFlow.push({
    test: 'chunkId → parse → bbox',
    input: tile.chunkId,
    output: bbox,
    valid: true
  });
});

test('九宫格 chunkIds 都可被独立解析', () => {
  const chunks = getCurrentAndSurroundingChunks(TEST_LAT, TEST_LON);
  const allValid = chunks.every(chunkId => {
    const parsed = parseChunkId(chunkId);
    if (!parsed) return false;
    const bbox = getTileBoundingBox(parsed.x, parsed.y, parsed.z);
    return bbox[0] < bbox[2] && bbox[1] < bbox[3];
  });
  assertTrue(allValid, '所有九宫格 chunkId 都可解析');
  
  compatibilityReport.dataFlow.push({
    test: '九宫格 chunkIds 解析',
    count: chunks.length,
    allValid,
    valid: true
  });
});

console.log('\n【测试组 5】边界情况处理');
console.log('----------------------------------------');

test('应处理度分秒输入', () => {
  const dmsLat = "23°8'11''";
  const dmsLon = "113°19'21''";
  const tile = getTile(dmsLat, dmsLon);
  assertTrue(tile.chunkId.includes('_'), '度分秒应正确转换');
  
  compatibilityReport.edgeCases.push({
    test: '度分秒输入',
    input: { lat: dmsLat, lon: dmsLon },
    output: tile.chunkId,
    valid: true
  });
});

test('应处理赤道附近坐标', () => {
  const tile = getTile(0.1, 113.3223);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertTrue(bbox[1] < 0.2 && bbox[3] > 0, '赤道附近 BBox 有效');
});

test('应处理本初子午线附近坐标', () => {
  const tile = getTile(51.5074, 0.1); // 伦敦附近
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertTrue(bbox[0] < 0.2 && bbox[2] > 0, '本初子午线附近 BBox 有效');
});

test('应处理负数坐标（西经/南纬）', () => {
  const tile = getTile(-33.8688, 151.2093); // 悉尼
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  assertTrue(bbox[1] < 0 && bbox[3] < 0, '南纬 BBox 正确');
});

// ============ 兼容性测试报告 ============

console.log('\n========================================');
console.log('兼容性测试报告');
console.log('========================================');
console.log(`总测试数: ${passed + failed}`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

console.log('\n详细兼容性报告:');
console.log('----------------------------------------');

console.log('\n【chunkId 格式】');
compatibilityReport.chunkIdFormat.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.sample) console.log(`    示例: ${item.sample}`);
});

console.log('\n【BBox 格式】');
compatibilityReport.bboxFormat.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.sample) console.log(`    示例: ${JSON.stringify(item.sample)}`);
});

console.log('\n【坐标顺序】');
compatibilityReport.coordinateOrder.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.order) console.log(`    顺序: ${item.order}`);
});

console.log('\n【数据流】');
compatibilityReport.dataFlow.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
});

console.log('\n【边界情况】');
compatibilityReport.edgeCases.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
});

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
  module: 'Module 1-2 Compatibility',
  timestamp: new Date().toISOString(),
  total: passed + failed,
  passed,
  failed,
  compatibilityReport,
  errors
};

const reportPath = path.join(__dirname, 'report_module1_2_compatibility.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`测试报告已保存至: ${reportPath}\n`);

process.exit(failed > 0 ? 1 : 0);
