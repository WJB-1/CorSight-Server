/**
 * 服务器基础功能测试脚本
 * 用于验证 Phase 1 各模块功能
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3002;

// 测试辅助函数
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            data: parsedData
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// 测试用例
async function runTests() {
  console.log('🧪 开始 Phase 1 功能测试...\n');

  // 测试 1: 健康检查接口
  console.log('1️⃣ 测试 /health 接口');
  try {
    const health = await makeRequest('/health');
    console.log('   状态码:', health.statusCode);
    console.log('   响应:', JSON.stringify(health.data, null, 2));
    
    if (health.data.status === 'ok' && health.data.service === 'nav-preview-backend') {
      console.log('   ✅ 健康检查通过\n');
    } else {
      console.log('   ❌ 健康检查失败\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 2: 根路由
  console.log('2️⃣ 测试根路由 /');
  try {
    const root = await makeRequest('/');
    console.log('   状态码:', root.statusCode);
    console.log('   响应:', JSON.stringify(root.data, null, 2));
    console.log('   ✅ 根路由正常\n');
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 3: 获取附近采样点（无参数，应返回 400）
  console.log('3️⃣ 测试 /api/navigation/nearby (无参数)');
  try {
    const nearbyNoParams = await makeRequest('/api/navigation/nearby');
    console.log('   状态码:', nearbyNoParams.statusCode);
    console.log('   响应:', JSON.stringify(nearbyNoParams.data, null, 2));
    
    if (nearbyNoParams.statusCode === 400) {
      console.log('   ✅ 参数验证正常\n');
    } else {
      console.log('   ❌ 参数验证异常\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 4: 获取附近采样点（有参数）
  console.log('4️⃣ 测试 /api/navigation/nearby (有参数: lat=39.9095&lon=116.3976)');
  try {
    const nearbyWithParams = await makeRequest('/api/navigation/nearby?lat=39.9095&lon=116.3976&radius=100');
    console.log('   状态码:', nearbyWithParams.statusCode);
    console.log('   响应:', JSON.stringify(nearbyWithParams.data, null, 2));
    
    if (nearbyWithParams.data.success) {
      console.log('   ✅ 空间查询接口正常\n');
    } else {
      console.log('   ⚠️  接口返回失败（可能是数据库未连接）\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 5: 保存 LLM 配置
  console.log('5️⃣ 测试 POST /api/config/llm (保存配置)');
  try {
    const saveConfig = await makeRequest('/api/config/llm', 'POST', {
      provider: 'gemini',
      api_key: 'test-api-key-12345',
      model_name: 'gemini-robotics-er-1.5-preview',
      is_active: true
    });
    console.log('   状态码:', saveConfig.statusCode);
    console.log('   响应:', JSON.stringify(saveConfig.data, null, 2));
    
    if (saveConfig.data.success) {
      console.log('   ✅ 配置保存成功\n');
    } else {
      console.log('   ❌ 配置保存失败\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 6: 获取当前激活配置
  console.log('6️⃣ 测试 GET /api/config/llm/active');
  try {
    const activeConfig = await makeRequest('/api/config/llm/active');
    console.log('   状态码:', activeConfig.statusCode);
    console.log('   响应:', JSON.stringify(activeConfig.data, null, 2));
    
    if (activeConfig.data.success && activeConfig.data.active_provider === 'gemini') {
      console.log('   ✅ 配置获取成功\n');
    } else {
      console.log('   ⚠️  配置获取异常\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  // 测试 7: 获取可用模型列表
  console.log('7️⃣ 测试 GET /api/config/llm/models');
  try {
    const models = await makeRequest('/api/config/llm/models');
    console.log('   状态码:', models.statusCode);
    console.log('   响应:', JSON.stringify(models.data, null, 2));
    
    if (models.data.success) {
      console.log('   ✅ 模型列表获取成功\n');
    } else {
      console.log('   ❌ 模型列表获取失败\n');
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message, '\n');
  }

  console.log('✨ 测试完成！');
}

// 运行测试
console.log('='.repeat(50));
console.log(' 导航预览 Agent - Phase 1 测试脚本');
console.log('='.repeat(50));
console.log('请确保服务器已启动: cd backend && npm start\n');

runTests().catch(console.error);