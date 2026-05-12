/**
 * 自动化调试脚本 - 播报质量检查
 *
 * 调用预览 API，对输出做严格质量检查，打分输出。
 *
 * 用法: cd backend/test && node debug-broadcast-quality.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

const http = require('http');

const TEST_REQUEST = {
  origin: '113.327969,23.133973',
  destination: '113.345206,23.136504',
  options: {
    enable_perception: false,  // 跳过视觉感知节省时间
    enable_broadcast: true
  }
};

function callPreviewAPI() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(TEST_REQUEST);
    const req = http.request({
      host: 'localhost',
      port: 3002,
      path: '/api/navigation/preview',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 120000
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function qualityCheck(text, routeData) {
  const checks = [];

  // 1. 段落数检查
  const paragraphs = text.split(/\n\n/).filter(p => p.trim().length > 10);
  checks.push({
    name: '段落数 >= 3',
    pass: paragraphs.length >= 3,
    detail: `实际 ${paragraphs.length} 段`
  });

  // 2. 无 Markdown
  const hasMarkdown = /[#*|`]|\[.+\]\(.+\)|---+/.test(text);
  checks.push({
    name: '无 Markdown 符号',
    pass: !hasMarkdown,
    detail: hasMarkdown ? '发现 Markdown 字符' : 'OK'
  });

  // 3. 无绝对方位词
  const cardinalMatches = text.match(/向(东北|东南|西北|西南|正东|正西|正南|正北|东|西|南|北)/g) || [];
  checks.push({
    name: '无绝对方位词',
    pass: cardinalMatches.length === 0,
    detail: cardinalMatches.length ? `发现 ${cardinalMatches.length} 处: ${cardinalMatches.slice(0,3).join(', ')}` : 'OK'
  });

  // 4. 无时钟方向
  const clockMatches = text.match(/\d+点(钟)?方向/g) || [];
  checks.push({
    name: '无时钟方向',
    pass: clockMatches.length === 0,
    detail: clockMatches.length ? `发现: ${clockMatches.join(', ')}` : 'OK'
  });

  // 5. 包含自然方向词
  const naturalDir = /(左转|右转|直行|稍向左转|稍向右转)/.test(text);
  checks.push({
    name: '包含自然方向词',
    pass: naturalDir,
    detail: naturalDir ? 'OK' : '未找到 左转/右转/直行 等'
  });

  // 6. 使用真实数据（距离）
  const totalDistance = routeData.route_summary?.total_distance || '';
  const distanceMatch = totalDistance.match(/[\d.]+/);
  const distanceNum = distanceMatch ? distanceMatch[0] : null;
  const usesRealDistance = distanceNum ? text.includes(distanceNum) : false;
  checks.push({
    name: '使用真实总距离',
    pass: usesRealDistance,
    detail: distanceNum ? (usesRealDistance ? `包含 ${distanceNum}` : `未提及 ${distanceNum}`) : '无法验证'
  });

  // 7. 无捏造的天桥（如果数据里没有 hazards 提到天桥）
  const dataHasBridge = (routeData.key_nodes || []).some(n =>
    (n.hazards || []).some(h => /天桥|地下通道|过街天桥/.test(h))
  );
  const textHasBridge = /天桥|地下通道|过街天桥/.test(text);
  const noFakedBridge = dataHasBridge || !textHasBridge;
  checks.push({
    name: '未捏造天桥',
    pass: noFakedBridge,
    detail: noFakedBridge ? 'OK' : '数据无天桥但文案提到了'
  });

  // 8. 无空话问候
  const platitudes = text.match(/(祝您一路平安|请注意安全|祝您旅途愉快|请小心|千万要注意)/g) || [];
  checks.push({
    name: '无空话问候',
    pass: platitudes.length === 0,
    detail: platitudes.length ? `发现: ${platitudes.join(', ')}` : 'OK'
  });

  // 9. 完整结束（不以省略号或半句话结尾）
  const trimmed = text.trim();
  const lastChar = trimmed[trimmed.length - 1];
  const completeEnding = /[。！？]/.test(lastChar);
  checks.push({
    name: '完整结束',
    pass: completeEnding,
    detail: completeEnding ? `以 "${lastChar}" 结束` : `异常结尾: "${trimmed.slice(-20)}"`
  });

  // 10. 文本长度合理
  const lengthOK = text.length >= 150 && text.length <= 800;
  checks.push({
    name: '文本长度 150-800字',
    pass: lengthOK,
    detail: `${text.length} 字`
  });

  // 11. 段3包含触觉/盲杖引导
  const hasTactileGuide = paragraphs.length >= 3 &&
    /(盲杖|触觉|墙面|路缘|路沿|栏杆|追踪|参照物|墙根)/.test(paragraphs[paragraphs.length - 1]);
  checks.push({
    name: '末段含触觉引导',
    pass: hasTactileGuide,
    detail: hasTactileGuide ? 'OK' : '末段未提及盲杖/触觉/参照物'
  });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  return { checks, passed, total, score: (passed / total * 100).toFixed(1) };
}

async function runOnce(attempt) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`第 ${attempt} 次调用预览 API`);
  console.log(`${'='.repeat(60)}`);

  const startTime = Date.now();
  const result = await callPreviewAPI();
  const elapsed = Date.now() - startTime;

  if (!result.success) {
    console.log('❌ API 失败:', result.error);
    return null;
  }

  const text = result.data.text || '';
  const meta = result.data.metadata?.broadcast || {};
  console.log(`耗时: ${(elapsed/1000).toFixed(1)}s | provider: ${meta.provider} | retried: ${meta.retried}`);

  console.log('\n--- 播报文案 ---');
  console.log(text);

  console.log('\n--- 质量检查 ---');
  const quality = qualityCheck(text, result.data);
  quality.checks.forEach(c => {
    console.log(`${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  });
  console.log(`\n得分: ${quality.passed}/${quality.total} (${quality.score}%)`);

  return { text, quality, meta };
}

async function main() {
  // 等后端就绪
  console.log('等待后端就绪...');
  for (let i = 0; i < 10; i++) {
    try {
      const ok = await new Promise((resolve) => {
        http.get('http://localhost:3002/health', { timeout: 1000 }, res => {
          resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
      });
      if (ok) { console.log('后端就绪'); break; }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }

  // 运行一次
  const result = await runOnce(1);

  if (!result) {
    console.log('\n测试失败');
    process.exit(1);
  }

  const passAll = result.quality.passed === result.quality.total;
  console.log('\n' + '='.repeat(60));
  console.log(passAll ? '🎉 全部通过！' : `⚠️ 有 ${result.quality.total - result.quality.passed} 项未通过`);
  console.log('='.repeat(60));

  process.exit(passAll ? 0 : 1);
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
