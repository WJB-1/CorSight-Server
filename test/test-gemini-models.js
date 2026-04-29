/**
 * Gemini 模型可用性测试脚本
 * 
 * 根据 guidance.md 文档，测试以下 Python 验证过的模型：
 * - ✅ gemini-3-flash-preview (可用)
 * - ✅ gemini-3.1-flash-lite-preview (可用)
 * - ✅ gemini-robotics-er-1.5-preview (可用)
 * - ❌ gemini-3.1-pro-preview (429 配额耗尽)
 * 
 * 调试脚本路径: navigation_agent/test/test-gemini-models.js
 */

const path = require('path');

// 添加 backend node_modules 路径
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const { HttpsProxyAgent } = require('https-proxy-agent');

// 代理配置
const PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
console.log(`[配置] 使用代理: ${PROXY_URL}\n`);

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY 未设置');
    process.exit(1);
}

// 要测试的模型列表（根据 guidance.md）
const TEST_MODELS = [
    { name: 'gemini-3-flash-preview', expected: 'available' },
    { name: 'gemini-3.1-flash-lite-preview', expected: 'available' },
    { name: 'gemini-robotics-er-1.5-preview', expected: 'available' },
    { name: 'gemini-3.1-pro-preview', expected: 'quota_exceeded' },
    { name: 'gemini-1.5-flash', expected: 'unknown' },
    { name: 'gemini-1.5-pro', expected: 'unknown' }
];

const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * 使用 REST API 直接测试 Gemini 模型
 */
async function testModelWithRest(modelName) {
    const fetch = require('node-fetch');
    const agent = new HttpsProxyAgent(PROXY_URL);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;

    const body = {
        contents: [{
            parts: [
                { text: '请只回复"OK"两个字，不要添加任何其他内容。' }
            ]
        }],
        generationConfig: {
            maxOutputTokens: 10,
            temperature: 0.1
        }
    };

    const startTime = Date.now();
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            agent: agent
        });
        const elapsed = Date.now() - startTime;

        const data = await response.json();

        if (!response.ok) {
            const error = data.error || {};
            return {
                success: false,
                elapsed,
                status: error.code || response.status,
                message: error.message || 'Unknown error',
                isQuotaError: error.code === 429 || error.status === 'RESOURCE_EXHAUSTED'
            };
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {
            success: true,
            elapsed,
            text: text.substring(0, 50),
            isValid: text.toLowerCase().includes('ok')
        };
    } catch (error) {
        return {
            success: false,
            elapsed: Date.now() - startTime,
            status: 'NETWORK_ERROR',
            message: error.message
        };
    }
}

/**
 * 使用 @google/genai SDK 测试模型
 */
async function testModelWithSDK(modelName) {
    try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        // 创建代理 agent
        const agent = new HttpsProxyAgent(PROXY_URL);

        const startTime = Date.now();
        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{
                role: 'user',
                parts: [{ text: '请只回复"OK"两个字，不要添加任何其他内容。' }]
            }],
            config: {
                maxOutputTokens: 10,
                temperature: 0.1
            }
        }, {
            // 传递 fetch 选项
            fetchOptions: { agent }
        });
        const elapsed = Date.now() - startTime;

        const text = response.text || '';
        return {
            success: true,
            elapsed,
            text: text.substring(0, 50),
            isValid: text.toLowerCase().includes('ok'),
            sdk: '@google/genai'
        };
    } catch (error) {
        return {
            success: false,
            status: error.code || 'SDK_ERROR',
            message: error.message,
            isQuotaError: error.code === 429 || error.message?.includes('RESOURCE_EXHAUSTED')
        };
    }
}

/**
 * 运行所有测试
 */
async function runTests() {
    console.log('========================================');
    console.log('Gemini 模型可用性测试');
    console.log('========================================\n');

    console.log(`API Key: ${API_KEY.substring(0, 20)}...`);
    console.log(`代理: ${PROXY_URL}\n`);

    const results = [];

    for (const model of TEST_MODELS) {
        console.log(`\n[测试] ${model.name}`);
        console.log(`预期: ${model.expected}`);
        console.log('-'.repeat(40));

        // 先测试 REST API
        const restResult = await testModelWithRest(model.name);
        console.log(`REST API: ${restResult.success ? '✅ 成功' : '❌ 失败'} (${restResult.elapsed}ms)`);
        if (restResult.success) {
            console.log(`  回复: "${restResult.text}"`);
        } else {
            console.log(`  错误: [${restResult.status}] ${restResult.message?.substring(0, 100)}`);
            if (restResult.isQuotaError) {
                console.log(`  ⚠️  配额耗尽 (429)`);
            }
        }

        results.push({
            model: model.name,
            expected: model.expected,
            restResult
        });

        // 延迟 1 秒避免触发限流
        await new Promise(r => setTimeout(r, 1000));
    }

    // 汇总
    console.log('\n\n========================================');
    console.log('测试结果汇总');
    console.log('========================================');

    const available = results.filter(r => r.restResult.success);
    const quotaExceeded = results.filter(r => r.restResult.isQuotaError);
    const failed = results.filter(r => !r.restResult.success && !r.restResult.isQuotaError);

    console.log(`\n✅ 可用模型 (${available.length}):`);
    available.forEach(r => console.log(`  - ${r.model} (${r.restResult.elapsed}ms)`));

    if (quotaExceeded.length > 0) {
        console.log(`\n⚠️  配额耗尽 (${quotaExceeded.length}):`);
        quotaExceeded.forEach(r => console.log(`  - ${r.model}`));
    }

    if (failed.length > 0) {
        console.log(`\n❌ 其他错误 (${failed.length}):`);
        failed.forEach(r => console.log(`  - ${r.model}: ${r.restResult.status}`));
    }

    console.log('\n\n📋 推荐配置 (llmConfig.js):');
    if (available.length > 0) {
        console.log(`  优先使用: ${available[0].model}`);
        console.log(`  备选: ${available.slice(1).map(r => r.model).join(', ')}`);
    }
}

runTests().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
