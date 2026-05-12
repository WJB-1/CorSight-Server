/**
 * 模型探测测试 - 从 backend 目录运行
 */

const dotenv = require('dotenv');
dotenv.config();

console.log('[启动] HTTPS_PROXY:', process.env.HTTPS_PROXY);

const modelTester = require('../backend/services/modelTester');
console.log('[启动] modelTester 加载完成\n');

async function probe() {
    console.log('[探测] 开始...\n');
    const results = await modelTester.probeAvailableModels();
    console.log('\n[结果] 探测完成，测试了', results.length, '个模型');

    const summary = modelTester.getProbeSummary(results);
    console.log('\n[摘要]', JSON.stringify(summary, null, 2));

    console.log('\n[详情]');
    results.forEach(r => {
        const icon = r.status === 'available' ? '✅' : r.status === 'error' ? '❌' : '⏭️';
        console.log(icon, r.provider + '/' + r.model, '-', r.status, r.response_time_ms ? '(' + r.response_time_ms + 'ms)' : '');
    });
}

probe().catch(e => {
    console.error('[错误]', e.message);
    console.error(e.stack);
    process.exit(1);
});
