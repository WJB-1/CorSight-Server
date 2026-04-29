/**
 * 测试预览API返回的数据结构
 * 验证 data.ir.route_summary vs data.route_summary
 */

const path = require('path');
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

const axios = require('axios');

const API_BASE = 'http://localhost:3002';

async function testDataStructure() {
    console.log('========================================');
    console.log('数据结构验证测试');
    console.log('========================================\n');

    const origin = '113.328057,23.133689';
    const destination = '113.351874,23.135563';

    try {
        const response = await axios.post(`${API_BASE}/api/navigation/preview`, {
            origin: origin,
            destination: destination,
            options: {
                enable_perception: true,
                enable_broadcast: true
            }
        }, { timeout: 60000 });

        const data = response.data;

        console.log('响应结构:');
        console.log('  data.success:', data.success);
        console.log('  data.data 的字段:', Object.keys(data.data || {}));
        console.log('');

        // 检查前端期望的结构
        console.log('【前端期望的数据路径】');

        // 问题1: route_summary
        const hasRouteSummaryDirect = data.data && data.data.route_summary;
        const hasRouteSummaryInIR = data.data && data.data.ir && data.data.ir.route_summary;

        console.log(`  data.route_summary: ${hasRouteSummaryDirect ? '✅ 存在' : '❌ 不存在'}`);
        console.log(`  data.ir.route_summary: ${hasRouteSummaryInIR ? '✅ 存在' : '❌ 不存在'}`);

        if (hasRouteSummaryInIR) {
            console.log('  -> route_summary 内容:', JSON.stringify(data.data.ir.route_summary, null, 2));
        }

        console.log('');

        // 问题2: key_nodes
        const hasKeyNodesDirect = data.data && data.data.key_nodes;
        const hasKeyNodesInIR = data.data && data.data.ir && data.data.ir.key_nodes;

        console.log(`  data.key_nodes: ${hasKeyNodesDirect ? '✅ 存在' : '❌ 不存在'}`);
        console.log(`  data.ir.key_nodes: ${hasKeyNodesInIR ? '✅ 存在' : '❌ 存在'}`);

        console.log('');
        console.log('========================================');

        if (!hasRouteSummaryDirect && hasRouteSummaryInIR) {
            console.log('⚠️  发现数据结构不匹配！');
            console.log('   前端访问: data.route_summary');
            console.log('   实际路径: data.ir.route_summary');
            console.log('');
            console.log('【修复方案】');
            console.log('   方案1: 修改前端代码，使用 data.ir.route_summary');
            console.log('   方案2: 修改后端代码，将 route_summary 提升到 data 层级');
            return false;
        }

        return true;

    } catch (error) {
        console.error('❌ 请求失败:', error.message);
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误:', error.response.data);
        }
        return false;
    }
}

async function main() {
    try {
        // 先检查服务
        await axios.get(`${API_BASE}/health`, { timeout: 5000 });
        console.log('✅ 后端服务已启动\n');
    } catch (e) {
        console.error('❌ 后端服务未启动');
        process.exit(1);
    }

    const ok = await testDataStructure();
    process.exit(ok ? 0 : 1);
}

main().catch(err => {
    console.error('测试异常:', err);
    process.exit(1);
});
