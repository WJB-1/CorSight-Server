/**
 * 调试 API 接口 - 测试分类模型列表接口
 */

const path = require('path');
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

const axios = require('axios');

const API_BASE = 'http://localhost:3002';

async function testClassifiedModels() {
    console.log('========================================');
    console.log('测试 /api/config/llm/models/classified 接口');
    console.log('========================================\n');

    try {
        const response = await axios.get(`${API_BASE}/api/config/llm/models/classified`, {
            timeout: 5000
        });

        console.log('✅ 请求成功!');
        console.log('状态码:', response.status);
        console.log('\n响应数据:');
        console.log(JSON.stringify(response.data, null, 2));

        // 验证数据结构
        if (response.data.success) {
            const data = response.data.data;
            console.log('\n📊 模型统计:');
            console.log(`  视觉模型: ${data.vision?.length || 0} 个`);
            console.log(`  文本模型: ${data.text?.length || 0} 个`);

            if (data.vision?.length > 0) {
                console.log('\n🖼️ 视觉模型示例:');
                console.log(`  ${data.vision[0].name} (${data.vision[0].provider})`);
            }

            if (data.text?.length > 0) {
                console.log('\n📝 文本模型示例:');
                console.log(`  ${data.text[0].name} (${data.text[0].provider})`);
            }
        }

    } catch (error) {
        console.error('❌ 请求失败');

        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误数据:', error.response.data);
        } else if (error.request) {
            console.error('无响应 - 后端服务可能未启动');
            console.error('请运行: cd navigation_agent/backend && npm start');
        } else {
            console.error('错误:', error.message);
        }
        process.exit(1);
    }
}

async function testSaveModels() {
    console.log('\n========================================');
    console.log('测试保存视觉/文本模型接口');
    console.log('========================================\n');

    try {
        // 先获取模型列表
        const listRes = await axios.get(`${API_BASE}/api/config/llm/models/classified`);
        const { vision, text } = listRes.data.data;

        if (vision.length === 0 || text.length === 0) {
            console.log('⚠️ 模型列表为空，跳过保存测试');
            return;
        }

        const visionModel = vision[0].name;
        const textModel = text[0].name;

        console.log(`测试保存视觉模型: ${visionModel}`);
        const visionRes = await axios.post(`${API_BASE}/api/config/llm/models/vision`, {
            model_name: visionModel
        });
        console.log('✅ 视觉模型保存成功:', visionRes.data.message);

        console.log(`\n测试保存文本模型: ${textModel}`);
        const textRes = await axios.post(`${API_BASE}/api/config/llm/models/text`, {
            model_name: textModel
        });
        console.log('✅ 文本模型保存成功:', textRes.data.message);

        // 验证保存结果
        console.log('\n验证保存结果...');
        const verifyRes = await axios.get(`${API_BASE}/api/config/llm/models/classified`);
        console.log('当前配置:', JSON.stringify(verifyRes.data.current, null, 2));

    } catch (error) {
        console.error('❌ 保存测试失败');
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('错误:', error.response.data);
        } else {
            console.error('错误:', error.message);
        }
    }
}

async function main() {
    console.log('API 接口调试工具\n');

    // 检查服务健康
    try {
        await axios.get(`${API_BASE}/health`, { timeout: 3000 });
        console.log('✅ 后端服务已启动\n');
    } catch (e) {
        console.error('❌ 后端服务未启动');
        console.error('请运行: cd navigation_agent/backend && npm start');
        process.exit(1);
    }

    await testClassifiedModels();
    await testSaveModels();

    console.log('\n========================================');
    console.log('调试完成');
    console.log('========================================');
}

main().catch(console.error);
