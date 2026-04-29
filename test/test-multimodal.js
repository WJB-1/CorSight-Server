/**
 * 多模态模型统一测试脚本
 * 
 * 使用 test.png (上海秋季街景) 测试 Gemini 和阿里云百炼的视觉模型
 * 调试脚本路径: navigation_agent/test/test-multimodal.js
 */

const path = require('path');
const fs = require('fs');

// 添加 backend node_modules 路径
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

// 代理配置
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

console.log(`[配置] 使用代理: ${PROXY_URL}\n`);

// 加载测试图片
const TEST_IMAGE_PATH = path.join(__dirname, 'test.png');
let TEST_IMAGE_BASE64 = '';

try {
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    TEST_IMAGE_BASE64 = imageBuffer.toString('base64');
    console.log(`[图片] 已加载: ${TEST_IMAGE_PATH}`);
    console.log(`      大小: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`);
} catch (err) {
    console.error(`❌ 无法加载图片: ${err.message}`);
    process.exit(1);
}

// 测试提示词
const TEST_PROMPT = '描述这张图片中的场景，包括道路、树木、行人和其他可见元素。请用一句话简要描述。';

// ============ Gemini 测试 ============

async function testGemini(modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { success: false, error: 'GEMINI_API_KEY 未设置' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{
            parts: [
                { text: TEST_PROMPT },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: TEST_IMAGE_BASE64
                    }
                }
            ]
        }],
        generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.3
        }
    };

    const startTime = Date.now();
    try {
        const response = await axios.post(url, body, {
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        const elapsed = Date.now() - startTime;

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // 检查是否有使用限制警告
        const usage = response.data.usageMetadata;
        const finishReason = response.data.candidates?.[0]?.finishReason;

        return {
            success: true,
            elapsed,
            text: text.substring(0, 200),
            finishReason,
            usage
        };
    } catch (error) {
        return {
            success: false,
            elapsed: Date.now() - startTime,
            error: error.response?.data?.error?.message || error.message,
            status: error.response?.status
        };
    }
}

// ============ 阿里云百炼测试 ============

async function testBailian(modelName) {
    const apiKey = process.env.BAILIAN_API_KEY;
    if (!apiKey) {
        return { success: false, error: 'BAILIAN_API_KEY 未设置' };
    }

    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const body = {
        model: modelName,
        messages: [
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
                        text: TEST_PROMPT
                    }
                ]
            }
        ],
        max_tokens: 200,
        temperature: 0.3
    };

    const startTime = Date.now();
    try {
        const response = await axios.post(url, body, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        const elapsed = Date.now() - startTime;

        const text = response.data.choices?.[0]?.message?.content || '';

        return {
            success: true,
            elapsed,
            text: text.substring(0, 200),
            usage: response.data.usage
        };
    } catch (error) {
        return {
            success: false,
            elapsed: Date.now() - startTime,
            error: error.response?.data?.error?.message || error.message,
            status: error.response?.status
        };
    }
}

// ============ 运行测试 ============

async function runTests() {
    console.log('========================================');
    console.log('多模态模型统一测试 (使用 test.png 街景图片)');
    console.log('========================================\n');

    console.log('测试提示词:');
    console.log(`"${TEST_PROMPT}"\n`);

    // Gemini 测试
    console.log('────────────────────────────────────────');
    console.log('🔵 Gemini 多模态测试');
    console.log('────────────────────────────────────────\n');

    const geminiModels = ['gemini-3-flash-preview'];

    for (const model of geminiModels) {
        console.log(`[测试] ${model}`);
        const result = await testGemini(model);

        if (result.success) {
            console.log(`✅ 成功 (${result.elapsed}ms)`);
            console.log(`   描述: ${result.text}`);
            if (result.finishReason && result.finishReason !== 'STOP') {
                console.log(`   ⚠️  提前结束原因: ${result.finishReason}`);
            }
        } else {
            console.log(`❌ 失败 (${result.elapsed}ms)`);
            console.log(`   错误: [${result.status}] ${result.error}`);
        }
        console.log('');
    }

    // 阿里云百炼测试
    console.log('────────────────────────────────────────');
    console.log('🟠 阿里云百炼多模态测试');
    console.log('────────────────────────────────────────\n');

    const bailianModels = ['qwen-vl-plus', 'qwen-vl-max'];

    for (const model of bailianModels) {
        console.log(`[测试] ${model}`);
        const result = await testBailian(model);

        if (result.success) {
            console.log(`✅ 成功 (${result.elapsed}ms)`);
            console.log(`   描述: ${result.text}`);
        } else {
            console.log(`❌ 失败 (${result.elapsed}ms)`);
            console.log(`   错误: [${result.status}] ${result.error}`);
        }
        console.log('');

        // 延迟 1 秒避免限流
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('========================================');
    console.log('测试完成');
    console.log('========================================');
}

runTests().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
