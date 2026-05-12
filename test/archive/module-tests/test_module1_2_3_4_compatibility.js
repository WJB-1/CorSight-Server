/**
 * 模块一、二与模块三、四接口兼容性测试
 * 
 * 测试内容：
 * 1. 模块1的 chunkId 与模块4的数据分区标识兼容性
 * 2. 模块1的坐标转换与模块4的 SamplingPoint.coordinates 兼容性
 * 3. 模块2的 BBox 与后端接口的兼容性
 * 4. 模块3产生的图像路径与模块4的 DirectionImages 兼容性
 * 5. 数据流：模块3 → 模块4（组装）→ 后端模块5
 * 
 * 使用方法：
 * node test/test_module1_2_3_4_compatibility.js
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

// ============ 模块四核心函数（模拟） ============

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * 生成采样点 ID
 */
function generatePointId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `Point_${timestamp}_${random}`;
}

/**
 * 创建 SamplingPoint（模块4核心函数）
 */
function createSamplingPoint(lat, lon, description, localImages) {
  const pointId = generatePointId();
  
  // 处理图片路径
  const processedImages = {};
  DIRECTIONS.forEach(dir => {
    if (localImages[dir] && typeof localImages[dir] === 'string') {
      processedImages[dir] = localImages[dir];
    }
  });

  return {
    point_id: pointId,
    coordinates: {
      longitude: typeof lon === 'string' ? dmsToDecimal(lon) : lon,
      latitude: typeof lat === 'string' ? dmsToDecimal(lat) : lat
    },
    scene_description: description || '',
    images: processedImages,
    status: 'pending',
    timestamp: Date.now()
  };
}

/**
 * 计算 chunkId 并注入采样点（模块1 → 模块4）
 */
function injectChunkIdToSamplingPoint(samplingPoint, zoom = DEFAULT_ZOOM) {
  const { latitude, longitude } = samplingPoint.coordinates;
  const tile = getTile(latitude, longitude, zoom);
  return {
    ...samplingPoint,
    chunk_id: tile.chunkId,
    tile_x: tile.x,
    tile_y: tile.y,
    tile_z: tile.z
  };
}

/**
 * 转换坐标为度分秒格式（模拟原始采集数据）
 */
function decimalToDms(decimal, isLat) {
  const degrees = Math.floor(decimal);
  const minutesFloat = (decimal - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  
  const suffix = isLat 
    ? (degrees >= 0 ? 'N' : 'S')
    : (degrees >= 0 ? 'E' : 'W');
    
  return `${Math.abs(degrees)}°${minutes}'${seconds}''${suffix}`;
}

// ============ 测试框架 ============
let passed = 0;
let failed = 0;
const errors = [];
const compatibilityReport = {
  chunkIdIntegration: [],
  coordinateFormat: [],
  imageFormat: [],
  dataFlow: [],
  backendCompatibility: []
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

function assertProperty(obj, prop, message) {
  if (!(prop in obj)) {
    throw new Error(`${message}: 缺少属性 ${prop}`);
  }
}

function assertArrayContains(arr, item, message) {
  if (!arr.includes(item)) {
    throw new Error(`${message}: 数组不包含 ${item}`);
  }
}

// ============ 测试用例 ============

console.log('\n========================================');
console.log('模块一、二与模块三、四接口兼容性测试');
console.log('========================================\n');

// 测试数据
const TEST_LAT = 23.1364;
const TEST_LON = 113.3223;
const TEST_DMS_LAT = "23°8'10''";
const TEST_DMS_LON = "113°19'21''";

console.log('【测试组 1】模块1 chunkId 与模块4数据分区标识');
console.log('----------------------------------------');

test('模块1生成的 chunkId 应可注入到模块4的采样点中', () => {
  // 模拟模块3采集的数据
  const localImages = {
    N: '/tmp/images/test_N.jpg',
    E: '/tmp/images/test_E.jpg',
    S: '/tmp/images/test_S.jpg',
    W: '/tmp/images/test_W.jpg'
  };
  
  // 模块4组装数据
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试场景', localImages);
  
  // 注入 chunkId（模块1 → 模块4）
  const enrichedPoint = injectChunkIdToSamplingPoint(point);
  
  assertProperty(enrichedPoint, 'chunk_id', '应包含 chunk_id');
  assertTrue(enrichedPoint.chunk_id.includes('_'), 'chunk_id 格式正确');
  
  compatibilityReport.chunkIdIntegration.push({
    test: 'chunkId 注入',
    input: { lat: TEST_LAT, lon: TEST_LON },
    output: enrichedPoint.chunk_id,
    valid: true
  });
});

test('注入的 chunkId 应与手动计算的 chunkId 一致', () => {
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  const enrichedPoint = injectChunkIdToSamplingPoint(point);
  
  const tile = getTile(TEST_LAT, TEST_LON);
  assertEqual(enrichedPoint.chunk_id, tile.chunkId, 'chunkId 应一致');
});

test('chunkId 应包含完整的 tile 坐标信息', () => {
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  const enrichedPoint = injectChunkIdToSamplingPoint(point);
  
  assertProperty(enrichedPoint, 'tile_x', '应包含 tile_x');
  assertProperty(enrichedPoint, 'tile_y', '应包含 tile_y');
  assertProperty(enrichedPoint, 'tile_z', '应包含 tile_z');
  
  const tile = getTile(TEST_LAT, TEST_LON);
  assertEqual(enrichedPoint.tile_x, tile.x, 'tile_x 正确');
  assertEqual(enrichedPoint.tile_y, tile.y, 'tile_y 正确');
  assertEqual(enrichedPoint.tile_z, tile.z, 'tile_z 正确');
});

console.log('\n【测试组 2】坐标格式兼容性');
console.log('----------------------------------------');

test('模块4应能处理模块3采集的度分秒坐标', () => {
  const point = createSamplingPoint(TEST_DMS_LAT, TEST_DMS_LON, '测试', {});
  
  // 模块4内部应自动转换为十进制
  assertTrue(typeof point.coordinates.latitude === 'number', '纬度应为数字');
  assertTrue(typeof point.coordinates.longitude === 'number', '经度应为数字');
  
  // 验证转换正确性
  const expectedLat = dmsToDecimal(TEST_DMS_LAT);
  const expectedLon = dmsToDecimal(TEST_DMS_LON);
  
  assertTrue(Math.abs(point.coordinates.latitude - expectedLat) < 0.0001, '纬度转换正确');
  assertTrue(Math.abs(point.coordinates.longitude - expectedLon) < 0.0001, '经度转换正确');
  
  compatibilityReport.coordinateFormat.push({
    test: '度分秒转换',
    input: { lat: TEST_DMS_LAT, lon: TEST_DMS_LON },
    output: point.coordinates,
    valid: true
  });
});

test('模块4输出的 coordinates 应符合后端模块5的要求', () => {
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  
  // 后端模块5要求: coordinates 为 { longitude, latitude }
  assertProperty(point.coordinates, 'longitude', '应有 longitude');
  assertProperty(point.coordinates, 'latitude', '应有 latitude');
  
  // MongoDB GeoJSON 要求先经度后纬度
  const coords = point.coordinates;
  assertTrue(coords.longitude > 70 && coords.longitude < 140, '经度在中国范围');
  assertTrue(coords.latitude > 0 && coords.latitude < 60, '纬度在中国范围');
  
  compatibilityReport.coordinateFormat.push({
    test: 'coordinates 结构',
    structure: '{ longitude, latitude }',
    order: '先经度后纬度（MongoDB 兼容）',
    valid: true
  });
});

test('同一坐标（度分秒 vs 十进制）应产生相同的 chunk_id', () => {
  const decimalPoint = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  const dmsLat = decimalToDms(TEST_LAT, true);
  const dmsLon = decimalToDms(TEST_LON, false);
  const dmsPoint = createSamplingPoint(dmsLat, dmsLon, '测试', {});
  
  const decimalEnriched = injectChunkIdToSamplingPoint(decimalPoint);
  const dmsEnriched = injectChunkIdToSamplingPoint(dmsPoint);
  
  assertEqual(decimalEnriched.chunk_id, dmsEnriched.chunk_id, '相同坐标应产生相同 chunk_id');
});

console.log('\n【测试组 3】图像格式兼容性（模块3 → 模块4）');
console.log('----------------------------------------');

test('模块4应正确处理模块3采集的8方位图像', () => {
  const localImages = {
    N: '/tmp/images/P001_N.jpg',
    NE: '/tmp/images/P001_NE.jpg',
    E: '/tmp/images/P001_E.jpg',
    SE: '/tmp/images/P001_SE.jpg',
    S: '/tmp/images/P001_S.jpg',
    SW: '/tmp/images/P001_SW.jpg',
    W: '/tmp/images/P001_W.jpg',
    NW: '/tmp/images/P001_NW.jpg'
  };
  
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', localImages);
  
  // 验证所有8个方向都有图片
  DIRECTIONS.forEach(dir => {
    assertProperty(point.images, dir, `应有 ${dir} 方向图片`);
    assertTrue(point.images[dir].includes('.jpg'), `${dir} 路径应包含图片扩展名`);
  });
  
  compatibilityReport.imageFormat.push({
    test: '8方位图像',
    directions: DIRECTIONS,
    valid: true
  });
});

test('模块4应处理部分方向缺失的图像', () => {
  const localImages = {
    N: '/tmp/images/P009_N.jpg',
    E: '/tmp/images/P009_E.jpg',
    W: ''  // 空字符串模拟缺失
  };
  
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', localImages);
  
  // 有值的方向应保留
  assertProperty(point.images, 'N', '应有 N 方向');
  assertProperty(point.images, 'E', '应有 E 方向');
  
  // 空字符串不应被添加
  assertTrue(!('W' in point.images) || point.images.W === '', 'W 方向应为空或未添加');
  
  compatibilityReport.imageFormat.push({
    test: '部分缺失处理',
    input: Object.keys(localImages),
    output: Object.keys(point.images),
    valid: true
  });
});

test('模块4输出的 images 格式应与后端模块5兼容', () => {
  const localImages = {
    N: '/tmp/images/test_N.jpg',
    S: '/tmp/images/test_S.jpg'
  };
  
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', localImages);
  
  // 后端要求 images 为对象，键为方向，值为路径或 URL
  assertTrue(typeof point.images === 'object', 'images 应为对象');
  assertTrue(!Array.isArray(point.images), 'images 不应为数组');
  
  // 验证路径格式（本地路径或 URL）
  Object.entries(point.images).forEach(([dir, path]) => {
    assertTrue(typeof path === 'string', `${dir} 路径应为字符串`);
    assertTrue(path.length > 0, `${dir} 路径不应为空`);
  });
});

console.log('\n【测试组 4】数据流兼容性（模块3 → 模块4 → 后端）');
console.log('----------------------------------------');

test('完整数据流：模块3采集 → 模块4组装 → 带 chunkId 的完整数据', () => {
  // 模拟模块3采集数据
  const module3Data = {
    location: { lat: TEST_LAT, lon: TEST_LON },
    sceneDescription: '悬空障碍物警告',
    images: {
      N: '/storage/P001_N.jpg',
      NE: '/storage/P001_NE.jpg',
      E: '/storage/P001_E.jpg'
    },
    timestamp: Date.now()
  };
  
  // 模块4组装
  const point = createSamplingPoint(
    module3Data.location.lat,
    module3Data.location.lon,
    module3Data.sceneDescription,
    module3Data.images
  );
  
  // 注入 chunkId
  const completeData = injectChunkIdToSamplingPoint(point);
  
  // 验证完整数据结构
  assertProperty(completeData, 'point_id', '应有 point_id');
  assertProperty(completeData, 'coordinates', '应有 coordinates');
  assertProperty(completeData, 'scene_description', '应有 scene_description');
  assertProperty(completeData, 'images', '应有 images');
  assertProperty(completeData, 'status', '应有 status');
  assertProperty(completeData, 'timestamp', '应有 timestamp');
  assertProperty(completeData, 'chunk_id', '应有 chunk_id');
  
  // 验证状态
  assertEqual(completeData.status, 'pending', '状态应为 pending');
  
  compatibilityReport.dataFlow.push({
    test: '完整数据流',
    input: 'module3Data',
    output: 'completeData with chunk_id',
    dataStructure: Object.keys(completeData),
    valid: true
  });
});

test('模块4生成的 point_id 应符合规范', () => {
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  
  // 格式: Point_{timestamp}_{random}
  const pattern = /^Point_\d+_\d{4}$/;
  assertTrue(pattern.test(point.point_id), `point_id 格式应为 Point_{timestamp}_{random}: ${point.point_id}`);
});

test('模块4组装的 JSON 应可直接用于后端模块5的上传', () => {
  const localImages = {
    N: '/tmp/test_N.jpg',
    S: '/tmp/test_S.jpg'
  };
  
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试场景', localImages);
  const completeData = injectChunkIdToSamplingPoint(point);
  
  // 转换为 JSON 字符串
  const jsonString = JSON.stringify(completeData);
  
  // 应能成功解析
  const parsed = JSON.parse(jsonString);
  assertEqual(parsed.point_id, completeData.point_id, 'JSON 序列化/反序列化一致性');
  
  // 验证关键字段类型（后端要求）
  assertTrue(typeof parsed.point_id === 'string', 'point_id 为字符串');
  assertTrue(typeof parsed.coordinates.longitude === 'number', 'longitude 为数字');
  assertTrue(typeof parsed.coordinates.latitude === 'number', 'latitude 为数字');
  assertTrue(typeof parsed.scene_description === 'string', 'scene_description 为字符串');
  assertTrue(typeof parsed.images === 'object', 'images 为对象');
  assertTrue(typeof parsed.timestamp === 'number', 'timestamp 为数字');
});

console.log('\n【测试组 5】与后端模块5的接口兼容性');
console.log('----------------------------------------');

test('BBox 字符串格式应符合后端 /api/map/chunk 接口要求', () => {
  const tile = getTile(TEST_LAT, TEST_LON);
  const bbox = getTileBoundingBox(tile.x, tile.y, tile.z);
  
  // 后端接口: GET /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}
  const bboxString = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
  
  // 验证格式
  const parts = bboxString.split(',');
  assertEqual(parts.length, 4, 'BBox 应有4部分');
  
  parts.forEach((part, idx) => {
    const num = parseFloat(part);
    assertTrue(!isNaN(num), `第 ${idx + 1} 部分应为数字`);
  });
  
  compatibilityReport.backendCompatibility.push({
    test: 'BBox 接口格式',
    endpoint: '/api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}',
    sample: bboxString,
    valid: true
  });
});

test('模块2加载的地图数据应可与模块4采集点数据关联', () => {
  // 模拟模块2加载的地图数据
  const mapData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [TEST_LON, TEST_LAT] // GeoJSON 格式: [lon, lat]
        },
        properties: {
          highway: 'footway'
        }
      }
    ]
  };
  
  // 模块4采集点
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  
  // 坐标系统应一致（都是先经度后纬度）
  const mapLon = mapData.features[0].geometry.coordinates[0];
  const mapLat = mapData.features[0].geometry.coordinates[1];
  
  assertTrue(Math.abs(mapLon - point.coordinates.longitude) < 0.0001, '经度一致');
  assertTrue(Math.abs(mapLat - point.coordinates.latitude) < 0.0001, '纬度一致');
  
  compatibilityReport.backendCompatibility.push({
    test: '坐标系统一致性',
    mapFormat: 'GeoJSON [lon, lat]',
    pointFormat: '{ longitude, latitude }',
    compatible: true,
    valid: true
  });
});

test('chunk_id 可用于后端 2dsphere 索引分区', () => {
  const point = createSamplingPoint(TEST_LAT, TEST_LON, '测试', {});
  const enrichedPoint = injectChunkIdToSamplingPoint(point);
  
  // chunk_id 格式: {z}_{x}_{y}，可用于空间分区
  const parts = enrichedPoint.chunk_id.split('_');
  assertEqual(parts.length, 3, 'chunk_id 应可分割为3部分');
  
  const z = parseInt(parts[0]);
  const x = parseInt(parts[1]);
  const y = parseInt(parts[2]);
  
  // 计算对应的 BBox
  const bbox = getTileBoundingBox(x, y, z);
  
  // 验证采集点坐标在 BBox 范围内
  const { longitude, latitude } = enrichedPoint.coordinates;
  assertTrue(longitude >= bbox[0] && longitude <= bbox[2], '经度在 BBox 内');
  assertTrue(latitude >= bbox[1] && latitude <= bbox[3], '纬度在 BBox 内');
  
  compatibilityReport.backendCompatibility.push({
    test: '空间分区验证',
    chunk_id: enrichedPoint.chunk_id,
    bbox,
    pointInBounds: true,
    valid: true
  });
});

// ============ 兼容性测试报告 ============

console.log('\n========================================');
console.log('模块间兼容性测试报告');
console.log('========================================');
console.log(`总测试数: ${passed + failed}`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

console.log('\n详细兼容性报告:');
console.log('----------------------------------------');

console.log('\n【模块1-4 chunkId 集成】');
compatibilityReport.chunkIdIntegration.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
});

console.log('\n【坐标格式兼容性】');
compatibilityReport.coordinateFormat.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.order) console.log(`    ${item.order}`);
});

console.log('\n【图像格式兼容性（模块3→4）】');
compatibilityReport.imageFormat.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
});

console.log('\n【数据流完整性】');
compatibilityReport.dataFlow.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.dataStructure) {
    console.log(`    数据结构: ${item.dataStructure.join(', ')}`);
  }
});

console.log('\n【后端模块5兼容性】');
compatibilityReport.backendCompatibility.forEach(item => {
  console.log(`  - ${item.test}: ${item.valid ? '✓' : '✗'}`);
  if (item.endpoint) console.log(`    接口: ${item.endpoint}`);
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
  module: 'Module 1-2-3-4 Compatibility',
  timestamp: new Date().toISOString(),
  total: passed + failed,
  passed,
  failed,
  compatibilityReport,
  errors
};

const reportPath = path.join(__dirname, 'report_module1_2_3_4_compatibility.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`测试报告已保存至: ${reportPath}\n`);

process.exit(failed > 0 ? 1 : 0);
