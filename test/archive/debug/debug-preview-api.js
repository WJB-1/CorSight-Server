/**
 * 导航预览API调试脚本
 * 单独测试 /api/navigation/preview 接口
 */

const path = require('path');
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

const axios = require('axios');

const API_BASE = 'http://localhost:3002';

async function testPreviewAPI() {
    console.log('========================================');
    console.log('导航预览API调试');
    console.log('========================================\n');

    // 测试用的起点终点（截图中的坐标）
    const origin = '113.328021,23.133647';
    const destination = '113.352171,23.135468';

    console.log(`测试坐标:`);
    console.log(`  起点: ${origin}`);
    console.log(`  终点: ${destination}\n`);

    try {
        console.log('发送请求到 /api/navigation/preview ...\n');

        const response = await axios.post(`${API_BASE}/api/navigation/preview`, {
            origin: origin,
            destination: destination,
            options: {
                enable_perception: false,  // 先关闭感知，测试基础流程
                enable_broadcast: true
            }
        }, {
            timeout: 30000
        });

        console.log('✅ 请求成功!');
        console.log('\n响应状态:', response.status);
        console.log('\n响应数据:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ 请求失败');

        if (error.response) {
            console.error('\n状态码:', error.response.status);
            console.error('\n错误响应:');
            console.error(JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('\n无法连接到服务器');
            console.error('请检查后端服务是否运行在端口 3002');
        } else {
            console.error('\n错误:', error.message);
        }
    }
}

// 先检查服务健康
async function checkHealth() {
    try {
        const res = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
        console.log('后端服务状态:', res.data);
        return true;
    } catch (e) {
        console.error('❌ 后端服务未启动或无法连接');
        console.error('请运行: cd navigation_agent/backend && npm start');
        return false;
    }
}

async function main() {
    const healthy = await checkHealth();
    if (!healthy) {
        process.exit(1);
    }

    console.log('');
    await testPreviewAPI();
}

main().catch(console.error);
