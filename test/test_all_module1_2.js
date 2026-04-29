/**
 * 模块一、二综合测试运行器
 * 
 * 运行所有模块一、二的测试：
 * 1. 模块一功能测试
 * 2. 模块二功能测试
 * 3. 模块一、二接口兼容性测试
 * 4. 模块一、二与模块三、四接口兼容性测试
 * 
 * 使用方法：
 * cd Blind_map && node test/test_all_module1_2.js
 * 
 * 或者分别运行单个测试：
 * node test/test_module1_grid.js                    # 模块一功能测试
 * node test/test_module2_map_service.js             # 模块二功能测试（需启动后端）
 * node test/test_module1_2_compatibility.js         # 模块一、二兼容性测试
 * node test/test_module1_2_3_4_compatibility.js     # 模块一、二与三、四兼容性测试
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_DIR = __dirname;
const REPORTS_DIR = path.join(TEST_DIR, 'reports');

// 确保报告目录存在
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// 测试配置
const TESTS = [
  {
    name: '模块一：区块网格管理器功能测试',
    file: 'test_module1_grid.js',
    requiresBackend: false
  },
  {
    name: '模块二：OSM 底图加载器功能测试',
    file: 'test_module2_map_service.js',
    requiresBackend: true
  },
  {
    name: '模块一、二接口兼容性测试',
    file: 'test_module1_2_compatibility.js',
    requiresBackend: false
  },
  {
    name: '模块一、二与模块三、四接口兼容性测试',
    file: 'test_module1_2_3_4_compatibility.js',
    requiresBackend: false
  }
];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 运行单个测试
function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}运行: ${test.name}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    const startTime = Date.now();
    const testPath = path.join(TEST_DIR, test.file);
    
    const child = spawn('node', [testPath], {
      stdio: 'inherit',
      cwd: path.join(TEST_DIR, '..')
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      resolve({
        name: test.name,
        file: test.file,
        success: code === 0,
        duration
      });
    });

    child.on('error', (err) => {
      console.error(`${colors.red}启动测试失败: ${err.message}${colors.reset}`);
      resolve({
        name: test.name,
        file: test.file,
        success: false,
        error: err.message,
        duration: 0
      });
    });
  });
}

// 检查后端服务
function checkBackend() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get('http://localhost:3000/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 移动报告文件到 reports 目录
function moveReports() {
  const files = fs.readdirSync(TEST_DIR);
  files.forEach(file => {
    if (file.startsWith('report_') && file.endsWith('.json')) {
      const src = path.join(TEST_DIR, file);
      const dest = path.join(REPORTS_DIR, file);
      fs.renameSync(src, dest);
    }
  });
}

// 生成综合报告
function generateSummaryReport(results) {
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    tests: results
  };

  const reportPath = path.join(REPORTS_DIR, 'summary_module1_2.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  
  return summary;
}

// 主函数
async function main() {
  console.log(`\n${colors.bright}${colors.blue}`);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     模块一、二综合测试套件                                    ║');
  console.log('║     (Grid Manager + Map Service)                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  // 检查后端服务
  const backendRunning = await checkBackend();
  if (backendRunning) {
    console.log(`${colors.green}✓ 后端服务运行中 (localhost:3000)${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}⚠ 后端服务未运行 (localhost:3000)${colors.reset}`);
    console.log(`${colors.yellow}  部分测试将被跳过${colors.reset}\n`);
  }

  // 筛选需要运行的测试
  const testsToRun = TESTS.filter(test => {
    if (test.requiresBackend && !backendRunning) {
      console.log(`${colors.yellow}跳过: ${test.name} (需要后端服务)${colors.reset}`);
      return false;
    }
    return true;
  });

  if (testsToRun.length === 0) {
    console.log(`${colors.red}没有可运行的测试${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n计划运行 ${testsToRun.length} 个测试套件...\n`);

  // 运行所有测试
  const results = [];
  for (const test of testsToRun) {
    const result = await runTest(test);
    results.push(result);
  }

  // 移动报告文件
  moveReports();

  // 生成综合报告
  const summary = generateSummaryReport(results);

  // 打印总结
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}测试总结${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  results.forEach((result, idx) => {
    const status = result.success 
      ? `${colors.green}✓ 通过${colors.reset}` 
      : `${colors.red}✗ 失败${colors.reset}`;
    console.log(`${idx + 1}. ${result.name}`);
    console.log(`   状态: ${status}`);
    console.log(`   耗时: ${result.duration}s`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
    console.log('');
  });

  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`总计: ${summary.total} | ${colors.green}通过: ${summary.passed}${colors.reset} | ${colors.red}失败: ${summary.failed}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  console.log(`详细报告已保存至: ${colors.bright}${REPORTS_DIR}${colors.reset}\n`);

  // 退出码
  process.exit(summary.failed > 0 ? 1 : 0);
}

// 错误处理
process.on('unhandledRejection', (err) => {
  console.error(`${colors.red}未处理的错误: ${err}${colors.reset}`);
  process.exit(1);
});

// 运行
main();
