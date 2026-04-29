/**
 * 模型可用性探测服务
 *
 * 模块 4.5：大模型 API 密钥服务端固化与可用性探测
 *
 * 关键修复：
 * - 添加代理配置解决网络连接问题
 * - 使用测试成功的模型列表
 *
 * 功能：
 * - 探测 Gemini、DeepSeek、阿里云百炼 下各候选模型的可用性
 * - 返回详细的测试报告
 */

const config = require('../config/envConfig');

// ==================== 代理配置 ====================
// 解决 Node.js 不走系统代理的问题
// 使用统一配置模块获取代理设置
const PROXY_URL = config.llm.getProxyUrl();
process.env.HTTP_PROXY = PROXY_URL;
process.env.HTTPS_PROXY = PROXY_URL;
process.env.NO_PROXY = config.llm.NO_PROXY;

console.log(`[modelTester] 代理配置: ${PROXY_URL}`);

// ==================== 加载配置 ====================
const { getKey, getAvailableModels, isMultimodalSupported } = require('../config/llmConfig');

// 候选模型名单（根据 test-all-models.js 测试结果更新）
// 参考: navigation_agent/test/test-all-models.js
//
// ✅ Gemini 可用模型：
//   - gemini-2.5-flash (3461ms, 最快)
//   - gemini-3-flash-preview (4288ms, 推荐)
//   - gemini-2.5-flash-lite (4202ms)
//   - gemini-3.1-flash-lite-preview (4954ms)
//   - gemini-robotics-er-1.5-preview (7194ms)
// ⚠️ 配额耗尽：gemini-2.5-pro, gemini-3.1-pro-preview
const CANDIDATE_MODELS = {
    gemini: [
        'gemini-2.5-flash',                  // ✅ 可用，速度最快
        'gemini-3-flash-preview',            // ✅ 可用，推荐
        'gemini-2.5-flash-lite',             // ✅ 可用
        'gemini-3.1-flash-lite-preview',     // ✅ 可用
        'gemini-robotics-er-1.5-preview',    // ✅ 可用
        'gemini-2.5-pro',                    // ⚠️ 配额耗尽
        'gemini-3.1-pro-preview'             // ⚠️ 配额耗尽
    ],
    deepseek: [
        'deepseek-chat',
        'deepseek-coder'
    ],
    bailian: [
        // 视觉模型
        'qwen-vl-plus',              // ✅ 最快视觉模型
        'qwen3-vl-flash',            // ✅ Qwen3 系列
        'qwen3-vl-plus',             // ✅ Qwen3 系列
        'qwen-vl-max',               // ✅ 可用
        'qvq-plus-latest',           // ✅ 可用
        'qvq-plus-2025-05-15',       // ✅ 可用
        // 纯文本模型
        'kimi-k2.5',                 // ✅ 最快文本模型
        'kimi/kimi-k2.5',            // ✅ 可用
        'kimi-k2-thinking',          // ✅ 可用
    ]
};

/**
 * 探测所有候选模型的可用性
 * 
 * @returns {Promise<Array>} 测试结果数组
 */
async function probeAvailableModels() {
    console.log('[modelTester] 开始探测模型可用性...');

    const results = [];

    for (const [provider, models] of Object.entries(CANDIDATE_MODELS)) {
        console.log(`[modelTester] 探测 ${provider}...`);

        // 检查是否有配置 API Key
        const apiKey = getKey(provider);
        if (!apiKey) {
            console.log(`[modelTester] ${provider} 未配置 API Key，跳过`);
            for (const model of models) {
                results.push({
                    provider,
                    model,
                    status: 'skipped',
                    error_message: 'API Key 未配置',
                    response_time_ms: null,
                    timestamp: new Date().toISOString()
                });
            }
            continue;
        }

        // 测试该 provider 下的每个模型
        for (const model of models) {
            const result = await testModel(provider, model, apiKey);
            results.push(result);

            // 添加小延迟，避免请求过快
            await delay(500);
        }
    }

    console.log(`[modelTester] 探测完成，共测试 ${results.length} 个模型`);
    return results;
}

/**
 * 测试单个模型
 * 
 * @param {string} provider - 提供商
 * @param {string} model - 模型名称
 * @param {string} apiKey - API Key
 * @returns {Promise<Object>} 测试结果
 */
async function testModel(provider, model, apiKey) {
    const startTime = Date.now();

    try {
        let testResult;

        switch (provider) {
            case 'gemini':
                testResult = await testGeminiModel(model, apiKey);
                break;
            case 'deepseek':
                testResult = await testDeepSeekModel(model, apiKey);
                break;
            case 'bailian':
                testResult = await testBailianModel(model, apiKey);
                break;
            default:
                throw new Error(`未知的 provider: ${provider}`);
        }

        const elapsed = Date.now() - startTime;

        return {
            provider,
            model,
            status: testResult.success ? 'available' : 'failed',
            error_message: testResult.error || null,
            response_time_ms: elapsed,
            test_details: testResult.details || {},
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[modelTester] 测试 ${provider}/${model} 出错:`, error.message);

        return {
            provider,
            model,
            status: 'failed',
            error_message: error.message,
            response_time_ms: elapsed,
            test_details: { exception: true },
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * 测试 Gemini 模型
 * 
 * @param {string} model - 模型名称
 * @param {string} apiKey - API Key
 * @returns {Promise<Object>} 测试结果
 */
async function testGeminiModel(model, apiKey) {
    try {
        // 使用 REST API 直接测试
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const agent = new HttpsProxyAgent(PROXY_URL);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await axios.post(url, {
            contents: [{
                parts: [{ text: '请回复"OK"' }]
            }],
            generationConfig: {
                maxOutputTokens: 10,
                temperature: 0.1
            }
        }, {
            httpsAgent: agent,
            timeout: 15000
        });

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const isValid = text.toLowerCase().includes('ok');

        return {
            success: isValid,
            error: isValid ? null : '响应内容不符合预期',
            details: {
                response_preview: text.substring(0, 100),
                multimodal_tested: false
            }
        };

    } catch (error) {
        let errorMessage = error.message;
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            errorMessage = `${status} ${data?.error?.message || JSON.stringify(data) || error.message}`;
        }

        return {
            success: false,
            error: errorMessage,
            details: { api_error: true }
        };
    }
}

/**
 * 测试 DeepSeek 模型
 * 
 * @param {string} model - 模型名称
 * @param {string} apiKey - API Key
 * @returns {Promise<Object>} 测试结果
 */
async function testDeepSeekModel(model, apiKey) {
    try {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const agent = new HttpsProxyAgent(PROXY_URL);

        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: model,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: '请回复"OK"' }
                ],
                max_tokens: 10,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: agent,
                timeout: 15000
            }
        );

        const text = response.data.choices?.[0]?.message?.content || '';
        const isValid = text.toLowerCase().includes('ok');

        return {
            success: isValid,
            error: isValid ? null : '响应内容不符合预期',
            details: {
                response_preview: text.substring(0, 100),
                multimodal_tested: false,
                usage: response.data.usage
            }
        };

    } catch (error) {
        let errorMessage = error.message;
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            errorMessage = `${status} ${data?.error?.message || data?.message || error.message}`;
        }

        return {
            success: false,
            error: errorMessage,
            details: { axios_error: true }
        };
    }
}

/**
 * 测试阿里云百炼 (Qwen) 模型
 * 
 * @param {string} model - 模型名称
 * @param {string} apiKey - API Key
 * @returns {Promise<Object>} 测试结果
 */
async function testBailianModel(model, apiKey) {
    try {
        const axios = require('axios');
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const agent = new HttpsProxyAgent(PROXY_URL);

        // 使用纯文本测试（避免图片格式兼容问题）
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: '请回复"OK"'
            }
        ];

        const response = await axios.post(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            {
                model: model,
                messages: messages,
                max_tokens: 10,
                temperature: 0.1
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: agent,
                timeout: 15000
            }
        );

        const text = response.data.choices?.[0]?.message?.content || '';
        const isValid = text.toLowerCase().includes('ok');

        return {
            success: isValid,
            error: isValid ? null : '响应内容不符合预期',
            details: {
                response_preview: text.substring(0, 100),
                multimodal_tested: false,
                usage: response.data.usage
            }
        };

    } catch (error) {
        let errorMessage = error.message;
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            errorMessage = `${status} ${data?.error?.message || data?.message || error.message}`;
        }

        return {
            success: false,
            error: errorMessage,
            details: { axios_error: true }
        };
    }
}

/**
 * 延迟函数
 * 
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取候选模型列表
 * 
 * @returns {Object} 候选模型配置
 */
function getCandidateModels() {
    return { ...CANDIDATE_MODELS };
}

/**
 * 获取探测摘要报告
 * 
 * @param {Array} results - 探测结果数组
 * @returns {Object} 摘要报告
 */
function getProbeSummary(results) {
    const total = results.length;
    const available = results.filter(r => r.status === 'available').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    // 按 provider 分组统计
    const byProvider = {};
    for (const result of results) {
        if (!byProvider[result.provider]) {
            byProvider[result.provider] = [];
        }
        byProvider[result.provider].push(result);
    }

    // 找出每个 provider 下第一个可用的模型作为推荐
    const recommended = {};
    for (const [provider, providerResults] of Object.entries(byProvider)) {
        const firstAvailable = providerResults.find(r => r.status === 'available');
        if (firstAvailable) {
            recommended[provider] = firstAvailable.model;
        }
    }

    return {
        total,
        available,
        failed,
        skipped,
        availability_rate: total > 0 ? Math.round((available / total) * 100) : 0,
        by_provider: byProvider,
        recommended_models: recommended,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    probeAvailableModels,
    getProbeSummary,
    getCandidateModels
};
