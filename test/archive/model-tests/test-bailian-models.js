/**
 * 阿里云百炼模型可用性测试脚本
 * 
 * 测试 Qwen 系列模型的 OpenAI 兼容接口
 * 调试脚本路径: navigation_agent/test/test-bailian-models.js
 */

const path = require('path');

// 添加 backend node_modules 路径
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 代理配置
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

console.log(`[配置] 使用代理: ${PROXY_URL}\n`);

const API_KEY = process.env.BAILIAN_API_KEY;
if (!API_KEY) {
    console.error('❌ BAILIAN_API_KEY 未设置');
    process.exit(1);
}

// 要测试的模型列表
const TEST_MODELS = [
    { name: 'qwen-vl-plus', supportsVision: true },
    { name: 'qwen-vl-max', supportsVision: true },
    { name: 'qwen2.5-vl-72b-instruct', supportsVision: true },
    { name: 'qwen2.5-vl-32b-instruct', supportsVision: true },
    { name: 'qwen-plus', supportsVision: false },
    { name: 'qwen-turbo', supportsVision: false }
];

// 10x10 红色方块 (满足阿里云最小尺寸要求)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8AARIQB46hC+0e1TgEAz54C8d7vKvkAAAAASUVORK5CYII=';

/**
 * 使用 OpenAI 兼容接口测试模型
 */
async function testModelWithOpenAI(modelName, supportsVision) {
    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    // 构建消息
    let messages;
    if (supportsVision) {
        // 多模态测试
        messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${TEST_IMAGE_BASE64}`
                        }
                    },
                    {
                        type: 'text',
                        text: '请只回复"OK"两个字，不要添加任何其他内容。'
                    }
                ]
            }
        ];
    } else {
        // 纯文本测试
        messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: '请只回复"OK"两个字，不要添加任何其他内容。'
            }
        ];
    }

    const body = {
        model: modelName,
        messages: messages,
        max_tokens: 10,
        temperature: 0.1
    };

    const startTime = Date.now();
    try {
        const response = await axios.post(url, body, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        const elapsed = Date.now() - startTime;

        const text = response.data.choices?.[0]?.message?.content || '';
        return {
            success: true,
            elapsed,
            text: text.substring(0, 50),
            isValid: text.toLowerCase().includes('ok'),
            usage: response.data.usage
        };
    } catch (error) {
        const elapsed = Date.now() - startTime;
        let errorMessage = error.message;
        let statusCode = 'ERROR';

        if (error.response) {
            statusCode = error.response.status;
            const data = error.response.data;
            errorMessage = data?.error?.message || data?.message || JSON.stringify(data) || error.message;
        }

        return {
            success: false,
            elapsed,
            status: statusCode,
            message: errorMessage,
            isAuthError: statusCode === 401,
            isNotFound: statusCode === 404 || errorMessage.includes('Not Found')
        };
    }
}

/**
 * 运行所有测试
 */
async function runTests() {
    console.log('========================================');
    console.log('阿里云百炼模型可用性测试');
    console.log('========================================\n');

    console.log(`API Key: ${API_KEY.substring(0, 20)}...`);
    console.log(`代理: ${PROXY_URL}\n`);

    const results = [];

    for (const model of TEST_MODELS) {
        console.log(`\n[测试] ${model.name}`);
        console.log(`视觉: ${model.supportsVision ? '支持' : '不支持'}`);
        console.log('-'.repeat(50));

        const result = await testModelWithOpenAI(model.name, model.supportsVision);

        if (result.success) {
            console.log(`✅ 成功 (${result.elapsed}ms)`);
            console.log(`  回复: "${result.text}"`);
            console.log(`  Token: ${JSON.stringify(result.usage)}`);
        } else {
            console.log(`❌ 失败 (${result.elapsed}ms)`);
            console.log(`  状态: ${result.status}`);
            console.log(`  错误: ${result.message?.substring(0, 200)}`);

            if (result.isAuthError) {
                console.log(`  ⚠️  认证错误，请检查 API Key`);
            } else if (result.isNotFound) {
                console.log(`  ⚠️  模型不存在或无权访问`);
            }
        }

        results.push({
            model: model.name,
            supportsVision: model.supportsVision,
            result
        });

        // 延迟 1 秒避免触发限流
        await new Promise(r => setTimeout(r, 1000));
    }

    // 汇总
    console.log('\n\n========================================');
    console.log('测试结果汇总');
    console.log('========================================');

    const available = results.filter(r => r.result.success);
    const authErrors = results.filter(r => r.result.isAuthError);
    const notFound = results.filter(r => r.result.isNotFound);
    const otherErrors = results.filter(r => !r.result.success && !r.result.isAuthError && !r.result.isNotFound);

    console.log(`\n✅ 可用模型 (${available.length}):`);
    available.forEach(r => {
        const vision = r.supportsVision ? '[视觉]' : '[文本]';
        console.log(`  - ${r.model} ${vision} (${r.result.elapsed}ms)`);
    });

    if (authErrors.length > 0) {
        console.log(`\n⚠️  认证错误 (${authErrors.length}):`);
        authErrors.forEach(r => console.log(`  - ${r.model}`));
    }

    if (notFound.length > 0) {
        console.log(`\n⚠️  模型不存在 (${notFound.length}):`);
        notFound.forEach(r => console.log(`  - ${r.model}`));
    }

    if (otherErrors.length > 0) {
        console.log(`\n❌ 其他错误 (${otherErrors.length}):`);
        otherErrors.forEach(r => console.log(`  - ${r.model}: ${r.result.status}`));
    }

    console.log('\n\n📋 推荐配置 (llmConfig.js):');
    const visionModels = available.filter(r => r.supportsVision);
    const textModels = available.filter(r => !r.supportsVision);

    if (visionModels.length > 0) {
        console.log(`  多模态推荐: ${visionModels[0].model}`);
    }
    if (textModels.length > 0) {
        console.log(`  纯文本推荐: ${textModels[0].model}`);
    }
}

runTests().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
