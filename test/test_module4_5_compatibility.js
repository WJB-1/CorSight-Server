/**
 * 模块四与模块五接口兼容性测试
 * 
 * 测试目的：验证前端模块四生成的数据格式与后端模块五接收格式的兼容性
 * 
 * 测试场景：
 * 1. 模拟前端创建采样点数据（模块四）
 * 2. 验证数据格式符合模块五的接收要求
 * 3. 测试数据上传到后端（模块五）
 * 4. 验证上传后能通过查询接口获取
 * 
 * 兼容性检查点：
 * - point_id 格式
 * - coordinates 结构（longitude, latitude）
 * - images 映射（8个方向）
 * - scene_description 字段
 * - status 字段
 * - timestamp 字段
 * 
 * 使用方法：
 * 1. 确保后端服务运行：cd Blind_map/backend && npm start
 * 2. 运行测试：node test/test_module4_5_compatibility.js
 */

const http = require('http');
const assert = require('assert');

const API_BASE = 'http://localhost:3000';

// 测试统计
let testCount = 0;
let passCount = 0;
let failCount = 0;
const testResults = [];

/**
 * 发送 HTTP 请求
 */
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(body)
          });
        } catch {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function post(path, data) {
  return request({
    hostname: 'localhost', port: 3000, path: path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  }, data);
}

async function get(path) {
  return request({
    hostname: 'localhost', port: 3000, path: path, method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
}

/**
 * 测试包装器
 */
async function test(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    testResults.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failCount++;
    testResults.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

// ==================== 兼容性测试 ====================

async function runCompatibilityTests() {
  console.log('\n' + '='.repeat(60));
  console.log('模块四与模块五接口兼容性测试');
  console.log('='.repeat(60));
  
  // 测试 1: 检查后端 API 可用性
  await test('后端服务健康检查', async () => {
    const res = await get('/health');
    assert.strictEqual(res.status, 200, '服务未响应');
    assert.strictEqual(res.body.status, 'ok', '服务状态异常');
  });
  
  // 测试 2: 模拟模块四创建的标准数据格式
  const module4Data = {
    point_id: `Point_${Date.now()}_AB12`,
    coordinates: {
      longitude: 113.3223,
      latitude: 23.1364
    },
    scene_description: '模拟前端模块四创建的采样点',
    images: {
      N: 'https://example.com/images/test_N.jpg',
      NE: 'https://example.com/images/test_NE.jpg',
      E: 'https://example.com/images/test_E.jpg',
      SE: 'https://example.com/images/test_SE.jpg',
      S: 'https://example.com/images/test_S.jpg',
      SW: 'https://example.com/images/test_SW.jpg',
      W: 'https://example.com/images/test_W.jpg',
      NW: 'https://example.com/images/test_NW.jpg'
    },
    status: 'synced',
    timestamp: Date.now()
  };
  
  await test('数据格式验证 - point_id 格式', async () => {
    assert(module4Data.point_id.startsWith('Point_'), 'point_id 应以 Point_ 开头');
    assert(module4Data.point_id.length > 10, 'point_id 长度应大于10');
  });
  
  await test('数据格式验证 - coordinates 结构', async () => {
    assert(typeof module4Data.coordinates.longitude === 'number', 'longitude 应为数字');
    assert(typeof module4Data.coordinates.latitude === 'number', 'latitude 应为数字');
    assert(module4Data.coordinates.longitude >= -180 && module4Data.coordinates.longitude <= 180, 'longitude 范围错误');
    assert(module4Data.coordinates.latitude >= -90 && module4Data.coordinates.latitude <= 90, 'latitude 范围错误');
  });
  
  await test('数据格式验证 - images 八方位', async () => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (const dir of directions) {
      assert(module4Data.images[dir], `缺少 ${dir} 方向图片`);
      assert(module4Data.images[dir].startsWith('http'), `${dir} 方向应为 URL`);
    }
  });
  
  await test('数据格式验证 - status 字段', async () => {
    const validStatuses = ['pending', 'uploading', 'synced'];
    assert(validStatuses.includes(module4Data.status), 'status 应为有效值');
  });
  
  await test('数据格式验证 - timestamp 字段', async () => {
    assert(typeof module4Data.timestamp === 'number', 'timestamp 应为数字');
    assert(module4Data.timestamp > 1600000000000, 'timestamp 应为有效时间戳');
  });
  
  // 测试 3: 上传数据到模块五
  let uploadedPointId;
  await test('上传数据到后端（模块五）', async () => {
    const formData = `jsonData=${encodeURIComponent(JSON.stringify(module4Data))}`;
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 3000, path: '/api/upload/sampling_point',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body: body }); }
        });
      });
      req.on('error', reject);
      req.write(formData);
      req.end();
    });
    
    assert.strictEqual(res.status, 201, `上传失败，状态码: ${res.status}`);
    assert.strictEqual(res.body.success, true, '响应应表示成功');
    assert(res.body.data.point_id, '响应应包含 point_id');
    uploadedPointId = res.body.data.point_id;
  });
  
  // 测试 4: 查询验证数据已入库
  await test('查询验证数据已入库', async () => {
    const res = await get(`/api/navigation/nearby?lat=${module4Data.coordinates.latitude}&lon=${module4Data.coordinates.longitude}&radius=100`);
    assert.strictEqual(res.status, 200, '查询失败');
    assert.strictEqual(res.body.success, true, '响应应表示成功');
    assert(res.body.data.points.length > 0, '应返回至少一个采样点');
    
    // 验证返回的数据结构
    const point = res.body.data.points[0];
    assert(point.point_id, '返回数据应包含 point_id');
    assert(point.location, '返回数据应包含 location');
    assert(typeof point.location.latitude === 'number', '返回数据应包含 latitude');
    assert(typeof point.location.longitude === 'number', '返回数据应包含 longitude');
  });
  
  // 测试 5: 测试部分方向缺失的数据（边界情况）
  const partialData = {
    point_id: `Point_${Date.now()}_XY99`,
    coordinates: {
      longitude: 113.3300,
      latitude: 23.1400
    },
    scene_description: '只有部分方向图片的测试点',
    images: {
      N: 'https://example.com/images/partial_N.jpg',
      S: 'https://example.com/images/partial_S.jpg'
      // 其他方向缺失
    },
    status: 'synced',
    timestamp: Date.now()
  };
  
  await test('上传部分方向缺失的数据', async () => {
    const formData = `jsonData=${encodeURIComponent(JSON.stringify(partialData))}`;
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 3000, path: '/api/upload/sampling_point',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body: body }); }
        });
      });
      req.on('error', reject);
      req.write(formData);
      req.end();
    });
    
    assert.strictEqual(res.status, 201, '部分方向缺失的数据也应上传成功');
    assert.strictEqual(res.body.success, true, '响应应表示成功');
  });
  
  // 测试 6: 测试坐标顺序（重要兼容性检查）
  await test('坐标顺序检查 - GeoJSON 格式', async () => {
    // 模块五要求 GeoJSON 格式：[longitude, latitude]
    // 模块四发送的是：{ longitude, latitude }
    // 后端应正确转换
    const coordData = {
      point_id: `Point_${Date.now()}_COORD`,
      coordinates: {
        longitude: 113.3500,
        latitude: 23.1500
      },
      scene_description: '坐标顺序测试',
      images: {},
      status: 'synced',
      timestamp: Date.now()
    };
    
    const formData = `jsonData=${encodeURIComponent(JSON.stringify(coordData))}`;
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 3000, path: '/api/upload/sampling_point',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body: body }); }
        });
      });
      req.on('error', reject);
      req.write(formData);
      req.end();
    });
    
    assert.strictEqual(res.status, 201, '坐标上传应成功');
    
    // 查询验证坐标正确
    const queryRes = await get(`/api/navigation/nearby?lat=23.1500&lon=113.3500&radius=50`);
    assert.strictEqual(queryRes.status, 200, '查询应成功');
    assert(queryRes.body.data.points.length > 0, '应能查询到该点');
  });
  
  // 测试 7: 测试特殊字符描述
  await test('特殊字符场景描述处理', async () => {
    const specialData = {
      point_id: `Point_${Date.now()}_SPEC`,
      coordinates: { longitude: 113.3600, latitude: 23.1600 },
      scene_description: '包含特殊字符：<>"\'&中文标点，。！测试',
      images: {},
      status: 'synced',
      timestamp: Date.now()
    };
    
    const formData = `jsonData=${encodeURIComponent(JSON.stringify(specialData))}`;
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost', port: 3000, path: '/api/upload/sampling_point',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body: body }); }
        });
      });
      req.on('error', reject);
      req.write(formData);
      req.end();
    });
    
    assert.strictEqual(res.status, 201, '特殊字符应正确处理');
  });
  
  // 输出汇总
  console.log('\n' + '='.repeat(60));
  console.log('兼容性测试结果汇总');
  console.log('='.repeat(60));
  console.log(`总测试数: ${testCount}`);
  console.log(`通过: ${passCount} ✓`);
  console.log(`失败: ${failCount} ✗`);
  console.log(`通过率: ${((passCount / testCount) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  if (failCount > 0) {
    console.log('\n失败的测试:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  // 兼容性结论
  console.log('\n' + '='.repeat(60));
  console.log('兼容性结论');
  console.log('='.repeat(60));
  if (passCount === testCount) {
    console.log('✓ 模块四与模块五接口完全兼容！');
    console.log('  - 数据格式符合要求');
    console.log('  - API 调用正常');
    console.log('  - 边界情况处理正确');
  } else if (passCount >= testCount * 0.8) {
    console.log('⚠ 模块四与模块五基本兼容，存在部分问题');
  } else {
    console.log('✗ 模块四与模块五存在严重兼容性问题');
  }
  console.log('='.repeat(60));
  
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runCompatibilityTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
