/**
 * 模型探测功能测试脚本
 */

const path = require('path');

// 添加 backend node_modules 路径
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

console.log('HTTPS_PROXY:', process.env.HTTPS_PROXY);
console.log('开始加载 modelTester...\n');

const modelTester = require('../backend/services/modelTester');

async function test() {
    console.log('开始模型探测测试...\n');
    try {
        const results = await modelTester.probeAvailableModels();
        console.log('\n探测完成，结果数量:', results.length);

        console.log('\n详细结果:');
        results.forEach(r => {
            console.log(`${r.provider}/${r.model}: ${r.status} (${r.response_time_ms || 'N/A'}ms)`);
        });

        const summary = modelTester.getProbeSummary(results);
        console.log('\n摘要:', JSON.stringify(summary, null, 2));
    } catch (error) {
        console.error('测试失败:', error.message);
        console.error(error.stack);
    }
}

test();
