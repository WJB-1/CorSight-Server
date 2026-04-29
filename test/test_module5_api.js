/**
 * 模块五后端 API 测试脚本
 * 
 * 测试内容：
 * 1. 健康检查端点
 * 2. 采样点上传接口 (POST /api/upload/sampling_point)
 * 3. 附近采样点查询接口 (GET /api/navigation/nearby)
 * 4. OSM 地图数据接口 (GET /api/map/chunk)
 * 
 * 使用方法：
 * cd Blind_map/backend && npm start
 * 然后在新终端运行：node test/test_module5_api.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 配置
const API_BASE = 'http://localhost:3000';
const TEST_IMAGE_PATH = path.join(__dirname, '../backend/public/images/P001_N.jpg');

// 测试统计
let passed = 0;
let failed = 0;
const errors = [];

/**
 * GET 请求
 */
async function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * 使用 multipart/form-data 上传（二进制方式）
 */
async function uploadMultipart(apiPath, fields, files = {}) {
  const boundary = '----FormBoundary' + Date.now();
  const chunks = [];
  
  // 添加普通字段
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n` +
      `\r\n${value}\r\n`
    ));
  }
  
  // 添加文件（二进制）
  for (const [key, filePath] of Object.entries(files)) {
    if (fs.existsSync(filePath)) {
      const fileName = path.basename(filePath);
      const fileData = fs.readFileSync(filePath);
      
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"; filename="${fileName}"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
      ));
      chunks.push(fileData);
      chunks.push(Buffer.from('\r\n'));
    }
  }
  
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  
  const body = Buffer.concat(chunks);
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    
    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(responseBody)
          });
        } catch {
          resolve({
            status: res.statusCode,
            body: responseBody
          });
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 测试断言
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * 运行单个测试
 */
async function runTest(name, testFn) {
  try {
    console.log(`\n[TEST] ${name}`);
    await testFn();
    console.log(`  ✓ PASSED`);
    passed++;
  } catch (error) {
    console.log(`  ✗ FAILED: ${error.message}`);
    failed++;
    errors.push({ test: name, error: error.message });
  }
}

// ==================== 测试用例 ====================

async function testHealthEndpoint() {
  const res = await get('/health');
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  assert(res.body.status === 'ok', 'Health status should be ok');
}

async function testRootEndpoint() {
  const res = await get('/');
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  assert(res.body.endpoints, 'Should have endpoints info');
}

async function testUploadSamplingPoint() {
  const testData = JSON.stringify({
    point_id: 'TEST_001',
    coordinates: { longitude: 113.3223, latitude: 23.1364 },
    scene_description: '测试采样点',
    images: {}
  });
  
  const res = await uploadMultipart('/api/upload/sampling_point', {
    jsonData: testData
  });
  
  assert(res.status === 201, `Expected status 201, got ${res.status}`);
  assert(res.body.success === true, 'Response should indicate success');
}

async function testUploadWithImage() {
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.log('  ⚠ SKIP: Test image not found');
    return;
  }
  
  const testData = JSON.stringify({
    point_id: 'TEST_002',
    coordinates: { longitude: 113.3300, latitude: 23.1400 },
    scene_description: '带图片的测试采样点',
    images: {}
  });
  
  const res = await uploadMultipart(
    '/api/upload/sampling_point',
    { jsonData: testData },
    { image_N: TEST_IMAGE_PATH }
  );
  
  assert(res.status === 201, `Expected status 201, got ${res.status}: ${res.body.message || res.body}`);
  assert(res.body.success === true, 'Response should indicate success');
}

async function testNavigationNearby() {
  const res = await get('/api/navigation/nearby?lat=23.1364&lon=113.3223&radius=1000');
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  assert(res.body.success === true, 'Response should indicate success');
}

async function testNavigationNearbyWithInvalidParams() {
  const res = await get('/api/navigation/nearby');
  assert(res.status === 400, `Expected status 400 for missing params, got ${res.status}`);
}

async function testMapChunk() {
  const res = await get('/api/map/chunk?bbox=113.31,23.12,113.33,23.15');
  if (res.status === 502) {
    console.log('  ⚠ OSM API temporarily unavailable (502)');
    return;
  }
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  assert(res.body.success === true, 'Response should indicate success');
}

async function testMapChunkInvalidBbox() {
  const res = await get('/api/map/chunk?bbox=invalid');
  assert(res.status === 400, `Expected status 400 for invalid bbox, got ${res.status}`);
}

async function test404Endpoint() {
  const res = await get('/api/nonexistent');
  assert(res.status === 404, `Expected status 404, got ${res.status}`);
}

// ==================== 主程序 ====================

async function main() {
  console.log('='.repeat(60));
  console.log('模块五后端 API 测试');
  console.log('='.repeat(60));
  console.log(`API Base: ${API_BASE}`);
  console.log(`Test Image: ${TEST_IMAGE_PATH}`);
  console.log('');
  
  try {
    const health = await get('/health');
    if (health.status !== 200) {
      console.error('❌ 服务器未响应');
      process.exit(1);
    }
    console.log('✓ 服务器连接正常');
  } catch (error) {
    console.error('❌ 无法连接到服务器');
    process.exit(1);
  }
  
  await runTest('健康检查端点', testHealthEndpoint);
  await runTest('根路由信息', testRootEndpoint);
  await runTest('上传采样点（仅JSON）', testUploadSamplingPoint);
  await runTest('上传采样点（带图片）', testUploadWithImage);
  await runTest('查询附近采样点', testNavigationNearby);
  await runTest('查询附近采样点（无效参数）', testNavigationNearbyWithInvalidParams);
  await runTest('获取OSM地图数据', testMapChunk);
  await runTest('获取OSM地图数据（无效bbox）', testMapChunkInvalidBbox);
  await runTest('404端点', test404Endpoint);
  
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  
  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.test}: ${e.error}`);
    });
  }
  
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
