/**
 * Phase 1 底层调试脚本
 * 用于深度诊断服务器启动和连接问题
 */

const http = require('http');
const net = require('net');
const path = require('path');

const TEST_PORT = 3002;
const TEST_HOST = 'localhost';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(type, message) {
  const color = colors[type] || colors.reset;
  console.log(`${color}${message}${colors.reset}`);
}

// 测试 1: 检查端口是否被占用
function testPortAvailability() {
  return new Promise((resolve) => {
    log('cyan', '\n[测试 1] 检查端口 ' + TEST_PORT + ' 是否被占用...');
    
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log('yellow', `  ⚠️  端口 ${TEST_PORT} 已被占用`);
        resolve(false);
      } else {
        log('red', `  ❌ 端口检查错误: ${err.message}`);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      log('green', `  ✅ 端口 ${TEST_PORT} 可用`);
      resolve(true);
    });
    
    server.listen(TEST_PORT, TEST_HOST);
  });
}

// 测试 2: 尝试连接服务器并获取响应
function testServerConnection() {
  return new Promise((resolve) => {
    log('cyan', '\n[测试 2] 尝试连接服务器...');
    
    const options = {
      hostname: TEST_HOST,
      port: TEST_PORT,
      path: '/health',
      method: 'GET',
      timeout: 3000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        log('green', `  ✅ 服务器响应: HTTP ${res.statusCode}`);
        log('blue', `  📄 响应内容:`);
        try {
          const json = JSON.parse(data);
          console.log('  ' + JSON.stringify(json, null, 2).replace(/\n/g, '\n  '));
        } catch {
          console.log('  ' + data);
        }
        resolve(true);
      });
    });
    
    req.on('error', (err) => {
      log('red', `  ❌ 连接失败: ${err.message}`);
      if (err.code === 'ECONNREFUSED') {
        log('yellow', `  💡 提示: 服务器可能未启动，请先运行: cd backend && node server.js`);
      }
      resolve(false);
    });
    
    req.on('timeout', () => {
      log('red', `  ❌ 连接超时`);
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// 测试 3: 验证服务器文件语法
function testServerFiles() {
  log('cyan', '\n[测试 3] 验证服务器文件...');
  
  const filesToCheck = [
    '../backend/server.js',
    '../backend/config/db.js',
    '../backend/config/llmConfig.js',
    '../backend/models/SamplingPoint.js',
    '../backend/routes/mapRoutes.js',
    '../backend/routes/configRoutes.js',
    '../backend/services/corsightService.js'
  ];
  
  let allOk = true;
  
  filesToCheck.forEach(file => {
    try {
      const fullPath = path.join(__dirname, file);
      require(fullPath);
      log('green', `  ✅ ${file}`);
    } catch (err) {
      log('red', `  ❌ ${file}: ${err.message}`);
      allOk = false;
    }
  });
  
  return allOk;
}

// 测试 4: 检查依赖安装
function checkDependencies() {
  log('cyan', '\n[测试 4] 检查依赖安装...');
  
  const deps = ['express', 'mongoose', 'cors', 'dotenv', 'multer'];
  let allOk = true;
  
  deps.forEach(dep => {
    try {
      require.resolve(dep);
      log('green', `  ✅ ${dep}`);
    } catch {
      log('red', `  ❌ ${dep} (未安装)`);
      allOk = false;
    }
  });
  
  if (!allOk) {
    log('yellow', '\n  💡 运行以下命令安装依赖:');
    log('blue', '     cd backend && npm install');
  }
  
  return allOk;
}

// 测试 5: 直接发送请求测试各个接口
async function testAllEndpoints() {
  log('cyan', '\n[测试 5] 测试所有接口...');
  
  const tests = [
    { name: 'Health', method: 'GET', path: '/health' },
    { name: 'Root', method: 'GET', path: '/' },
    { name: 'Nearby (无参数)', method: 'GET', path: '/api/navigation/nearby' },
    { name: 'Nearby (有参数)', method: 'GET', path: '/api/navigation/nearby?lat=39.9&lon=116.4&radius=100' },
    { name: 'Config Active', method: 'GET', path: '/api/config/llm/active' },
    { name: 'Config Models', method: 'GET', path: '/api/config/llm/models' },
    { name: 'Config Save', method: 'POST', path: '/api/config/llm', body: { provider: 'test', api_key: 'key', model_name: 'model' } }
  ];
  
  for (const test of tests) {
    await new Promise((resolve) => {
      const options = {
        hostname: TEST_HOST,
        port: TEST_PORT,
        path: test.path,
        method: test.method,
        timeout: 2000,
        headers: test.body ? { 'Content-Type': 'application/json' } : {}
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const status = res.statusCode < 400 ? 'green' : 'yellow';
          log(status, `  ${res.statusCode} ${test.method} ${test.path}`);
          resolve();
        });
      });
      
      req.on('error', (err) => {
        log('red', `  ERR ${test.method} ${test.path}: ${err.code}`);
        resolve();
      });
      
      if (test.body) {
        req.write(JSON.stringify(test.body));
      }
      req.end();
    });
  }
}

// 主函数
async function main() {
  console.log('='.repeat(60));
  log('blue', '  Phase 1 底层调试诊断工具');
  console.log('='.repeat(60));
  
  // 运行所有测试
  const portAvailable = await testPortAvailability();
  const depsOk = checkDependencies();
  const filesOk = testServerFiles();
  
  if (!portAvailable) {
    log('yellow', '\n⚠️  端口被占用，但继续测试现有服务...');
  }
  
  if (depsOk && filesOk) {
    await testServerConnection();
    await testAllEndpoints();
  } else {
    log('red', '\n❌ 环境检查失败，请先修复上述问题');
  }
  
  console.log('\n' + '='.repeat(60));
  log('blue', '  诊断完成');
  console.log('='.repeat(60));
  
  log('cyan', '\n下一步建议:');
  log('blue', '  1. 确保 MongoDB 已启动');
  log('blue', '  2. cd backend && npm install');
  log('blue', '  3. cd backend && node server.js');
  log('blue', '  4. 新开终端: node test/debug.js');
}

main().catch(console.error);