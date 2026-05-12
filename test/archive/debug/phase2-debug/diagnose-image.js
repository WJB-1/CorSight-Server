/**
 * 图片加载诊断脚本
 * 测试 Blind_map 后端的图片 CORS 配置
 */

const BLINDMAP_IMAGE_URL = 'http://localhost:3000/public/images/P001_N.jpg';

// 测试 1: 直接通过 fetch HEAD 请求测试 CORS
async function testCORS() {
  console.log('[测试 1] 测试 CORS 配置...');
  try {
    const response = await fetch(BLINDMAP_IMAGE_URL, {
      method: 'HEAD',
      mode: 'cors'
    });
    
    console.log('✅ CORS 测试通过');
    console.log('   状态码:', response.status);
    console.log('   Access-Control-Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
    return true;
  } catch (err) {
    console.log('❌ CORS 测试失败');
    console.log('   错误:', err.message);
    return false;
  }
}

// 测试 2: 检查后端健康
async function testBackend() {
  console.log('\n[测试 2] 测试后端服务...');
  try {
    const response = await fetch('http://localhost:3000/health');
    const data = await response.json();
    console.log('✅ 后端服务正常');
    console.log('   状态:', data.status);
    console.log('   服务:', data.service);
    return true;
  } catch (err) {
    console.log('❌ 后端服务异常');
    console.log('   错误:', err.message);
    return false;
  }
}

// 测试 3: 通过 Image 对象加载
function testImageLoad() {
  return new Promise((resolve) => {
    console.log('\n[测试 3] 通过 Image 对象加载...');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      console.log('✅ 图片加载成功');
      console.log('   尺寸:', img.width, 'x', img.height);
      resolve(true);
    };
    
    img.onerror = () => {
      console.log('❌ 图片加载失败');
      console.log('   URL:', BLINDMAP_IMAGE_URL);
      resolve(false);
    };
    
    img.src = BLINDMAP_IMAGE_URL;
  });
}

// 运行所有测试
async function runDiagnostics() {
  console.log('========================================');
  console.log('Blind_map 图片加载诊断');
  console.log('图片URL:', BLINDMAP_IMAGE_URL);
  console.log('========================================\n');
  
  const backendOk = await testBackend();
  const corsOk = await testCORS();
  const imageOk = await testImageLoad();
  
  console.log('\n========================================');
  console.log('诊断结果:');
  console.log('========================================');
  
  if (!backendOk) {
    console.log('❌ Blind_map 后端未启动或无法访问');
    console.log('   请执行: cd Blind_map/backend && npm start');
  } else if (!corsOk) {
    console.log('❌ CORS 配置未生效');
    console.log('   请确认已修改 app.js 并重启后端');
    console.log('   关键代码:');
    console.log('   app.use(\'/public\', express.static(path.join(__dirname, \'public\'), {');
    console.log('     setHeaders: (res, path) => {');
    console.log('       res.set(\'Access-Control-Allow-Origin\', \'*\');');
    console.log('     }');
    console.log('   }));');
  } else if (!imageOk) {
    console.log('❌ 图片存在但无法显示（可能是格式问题）');
  } else {
    console.log('✅ 所有测试通过！图片应该能正常显示。');
  }
  
  console.log('\n如果问题仍然存在，请检查:');
  console.log('1. Blind_map 后端是否真的在端口 3000 运行');
  console.log('2. app.js 的 CORS 修改已保存并重启');
  console.log('3. 浏览器控制台是否有更详细的错误信息');
}

// 页面加载后自动运行
window.addEventListener('load', runDiagnostics);
