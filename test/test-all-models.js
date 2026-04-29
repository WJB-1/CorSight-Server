/**
 * 全面模型可用性测试脚本
 * 
 * 测试所有 Gemini 和阿里云百炼模型
 * 使用 test.png (上海秋季街景) 进行多模态测试
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

// API Keys
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BAILIAN_KEY = process.env.BAILIAN_API_KEY;

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
const VISION_PROMPT = '描述这张图片中的场景，包括道路、树木、行人和其他可见元素。请用一句话简要描述。';
const TEXT_PROMPT = '请回复"OK"两个字，不要添加任何其他内容。';

// ============ 模型配置 ============

const GEMINI_MODELS = [
    // 已验证可用
    { name: 'gemini-3-flash-preview', type: 'vision', tested: true },
    { name: 'gemini-3.1-flash-lite-preview', type: 'vision', tested: true },
    { name: 'gemini-robotics-er-1.5-preview', type: 'vision', tested: true },
    // 新模型待测试
    { name: 'gemini-2.5-pro', type: 'vision', tested: false },
    { name: 'gemini-2.5-flash', type: 'vision', tested: false },
    { name: 'gemini-2.5-flash-lite', type: 'vision', tested: false },
    { name: 'gemini-2.5-flash-lite-preview-09-2025', type: 'vision', tested: false },
    { name: 'gemini-embedding-2-preview', type: 'embedding', tested: false },
];

const BAILIAN_VISION_MODELS = [
    // 已验证可用
    { name: 'qwen-vl-plus', type: 'vision', tested: true },
    { name: 'qwen-vl-max', type: 'vision', tested: true },
    // 新模型待测试
    { name: 'qvq-max', type: 'vision', tested: false },
    { name: 'qvq-plus-latest', type: 'vision', tested: false },
    { name: 'qvq-plus-2025-05-15', type: 'vision', tested: false },
    { name: 'qwen3-vl-flash', type: 'vision', tested: false },
    { name: 'qwen3-vl-plus', type: 'vision', tested: false },
];

const BAILIAN_TEXT_MODELS = [
    // 新模型待测试
    { name: 'kimi-k2-thinking', type: 'text', tested: false },
    { name: 'kimi-k2.5', type: 'text', tested: false },
    { name: 'kimi/kimi-k2.5', type: 'text', tested: false },
];

// ============ Gemini 测试 ============

async function testGemini(model) {
    if (!GEMINI_KEY) {
        return { success: false, error: 'GEMINI_API_KEY 未设置' };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${GEMINI_KEY}`;

    let body;
    if (model.type === 'vision') {
        body = {
            contents: [{
                parts: [
                    { text: VISION_PROMPT },
                    {
                        inlineData: {
                            mimeType: 'image/png',
                            data: TEST_IMAGE_BASE64
                        }
                    }
                ]
            }],
            generationConfig: { maxOutputTokens: 200, temperature: 0.3 }
        };
    } else {
        body = {
            contents: [{
                parts: [{ text: TEXT_PROMPT }]
            }],
            generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
        };
    }

    const startTime = Date.now();
    try {
        const response = await axios.post(url, body, {
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        const elapsed = Date.now() - startTime;

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const finishReason = response.data.candidates?.[0]?.finishReason;

        return {
            success: true,
            elapsed,
            text: text.substring(0, 150),
            finishReason,
            isTruncated: finishReason === 'MAX_TOKENS'
        };
    } catch (error) {
        return {
            success: false,
            elapsed: Date.now() - startTime,
            error: error.response?.data?.error?.message || error.message,
            status: error.response?.status,
            isQuotaError: error.response?.status === 429,
            isNotFound: error.response?.status === 404
        };
    }
}

// ============ 阿里云百炼测试 ============

async function testBailian(model) {
    if (!BAILIAN_KEY) {
        return { success: false, error: 'BAILIAN_API_KEY 未设置' };
    }

    const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    let messages;
    if (model.type === 'vision') {
        messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: `data:image/png;base64,${TEST_IMAGE_BASE64}` }
                    },
                    { type: 'text', text: VISION_PROMPT }
                ]
            }
        ];
    } else {
        messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: TEXT_PROMPT }
        ];
    }

    const body = {
        model: model.name,
        messages: messages,
        max_tokens: model.type === 'vision' ? 200 : 10,
        temperature: 0.3
    };

    const startTime = Date.now();
    try {
        const response = await axios.post(url, body, {
            headers: { 'Authorization': `Bearer ${BAILIAN_KEY}` },
            httpsAgent: proxyAgent,
            timeout: 30000
        });
        const elapsed = Date.now() - startTime;

        const text = response.data.choices?.[0]?.message?.content || '';

        return {
            success: true,
            elapsed,
            text: text.substring(0, 150),
            usage: response.data.usage
        };
    } catch (error) {
        return {
            success: false,
            elapsed: Date.now() - startTime,
            error: error.response?.data?.error?.message || error.message,
            status: error.response?.status,
            isAuthError: error.response?.status === 401,
            isNotFound: error.response?.status === 404
        };
    }
}

// ============ 运行测试 ============

async function runTests() {
    console.log('========================================');
    console.log('全面模型可用性测试');
    console.log('========================================\n');

    const allResults = {
        gemini: [],
        bailianVision: [],
        bailianText: []
    };

    // 测试 Gemini 模型
    if (GEMINI_KEY) {
        console.log('🔵 Gemini 模型测试');
        console.log('────────────────────────────────────────\n');

        for (const model of GEMINI_MODELS) {
            process.stdout.write(`[测试] ${model.name} ... `);
            const result = await testGemini(model);
            allResults.gemini.push({ model: model.name, ...result });

            if (result.success) {
                console.log(`✅ ${result.elapsed}ms`);
                if (result.isTruncated) {
                    console.log(`       ⚠️  回复被截断`);
                }
            } else {
                console.log(`❌ ${result.elapsed}ms`);
                console.log(`       错误: [${result.status}] ${result.error?.substring(0, 80)}`);
            }

            await new Promise(r => setTimeout(r, 500));
        }
        console.log('');
    }

    // 测试阿里云百炼视觉模型
    if (BAILIAN_KEY) {
        console.log('🟠 阿里云百炼 - 视觉模型');
        console.log('────────────────────────────────────────\n');

        for (const model of BAILIAN_VISION_MODELS) {
            process.stdout.write(`[测试] ${model.name} ... `);
            const result = await testBailian(model);
            allResults.bailianVision.push({ model: model.name, ...result });

            if (result.success) {
                console.log(`✅ ${result.elapsed}ms`);
            } else {
                console.log(`❌ ${result.elapsed}ms`);
                console.log(`       错误: [${result.status}] ${result.error?.substring(0, 80)}`);
            }

            await new Promise(r => setTimeout(r, 500));
        }
        console.log('');

        // 测试阿里云百炼纯文本模型
        console.log('🟠 阿里云百炼 - 纯文本模型');
        console.log('────────────────────────────────────────\n');

        for (const model of BAILIAN_TEXT_MODELS) {
            process.stdout.write(`[测试] ${model.name} ... `);
            const result = await testBailian(model);
            allResults.bailianText.push({ model: model.name, ...result });

            if (result.success) {
                console.log(`✅ ${result.elapsed}ms`);
            } else {
                console.log(`❌ ${result.elapsed}ms`);
                console.log(`       错误: [${result.status}] ${result.error?.substring(0, 80)}`);
            }

            await new Promise(r => setTimeout(r, 500));
        }
        console.log('');
    }

    // 汇总报告
    console.log('========================================');
    console.log('测试结果汇总');
    console.log('========================================\n');

    // Gemini 结果
    const geminiAvailable = allResults.gemini.filter(r => r.success);
    const geminiVision = geminiAvailable.filter(r => {
        const model = GEMINI_MODELS.find(m => m.name === r.model);
        return model?.type === 'vision';
    });

    console.log('🔵 Gemini:');
    console.log(`   可用: ${geminiAvailable.length}/${allResults.gemini.length}`);
    if (geminiVision.length > 0) {
        console.log(`   视觉模型: ${geminiVision.map(r => r.model).join(', ')}`);
    }
    console.log('');

    // 阿里云百炼结果
    const bailianVisionAvailable = allResults.bailianVision.filter(r => r.success);
    const bailianTextAvailable = allResults.bailianText.filter(r => r.success);

    console.log('🟠 阿里云百炼:');
    console.log(`   视觉模型可用: ${bailianVisionAvailable.length}/${allResults.bailianVision.length}`);
    if (bailianVisionAvailable.length > 0) {
        console.log(`   ${bailianVisionAvailable.map(r => r.model).join(', ')}`);
    }
    console.log(`   文本模型可用: ${bailianTextAvailable.length}/${allResults.bailianText.length}`);
    if (bailianTextAvailable.length > 0) {
        console.log(`   ${bailianTextAvailable.map(r => r.model).join(', ')}`);
    }
    console.log('');

    // 推荐配置
    console.log('📋 推荐配置 (llmConfig.js):');
    console.log('   Gemini 视觉:');
    if (geminiVision.length > 0) {
        console.log(`     - 优先: ${geminiVision[0].model} (${geminiVision[0].elapsed}ms)`);
        geminiVision.slice(1).forEach(r => console.log(`     - 备选: ${r.model} (${r.elapsed}ms)`));
    }
    console.log('   阿里云百炼视觉:');
    if (bailianVisionAvailable.length > 0) {
        console.log(`     - 优先: ${bailianVisionAvailable[0].model} (${bailianVisionAvailable[0].elapsed}ms)`);
    }
    console.log('   阿里云百炼文本:');
    if (bailianTextAvailable.length > 0) {
        console.log(`     - 优先: ${bailianTextAvailable[0].model} (${bailianTextAvailable[0].elapsed}ms)`);
    }

    return allResults;
}

runTests().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
