/**
 * 统一大模型客户端 (完全重构版)
 *
 * 遵循《LLM大模型API统一接入规范与修复指南》
 *
 * 核心修复：
 * 1. 使用 https-proxy-agent + node-fetch 强制接管全局 fetch
 * 2. DeepSeek 和 Qwen 统一使用 OpenAI SDK
 * 3. Gemini 使用 @google/genai SDK
 * 4. 所有请求通过代理，解决网络连接问题
 */

// ==================== 第一步：代理配置（必须在所有依赖之前）====================
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../config/envConfig');

// 使用统一配置模块获取代理设置
const PROXY_URL = config.llm.getProxyUrl();
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

console.log(`[llmClient] 代理配置: ${PROXY_URL}`);

// 强制接管 Node.js 全局 fetch (专治旧版与新版未暴露 agent 选项的 SDK)
const fetch = require('node-fetch');
globalThis.fetch = function (url, options = {}) {
    // 只对 HTTPS 请求使用代理
    if (url.startsWith('https://')) {
        return fetch(url, { ...options, agent: proxyAgent });
    }
    return fetch(url, options);
};

// ==================== 第二步：加载依赖 ====================
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const llmConfig = require('../config/llmConfig');
const { getKey, getActiveModel } = llmConfig;

// 加载各平台 SDK
let OpenAI;
let GoogleGenAI;

try {
    const openaiModule = require('openai');
    OpenAI = openaiModule.OpenAI;
    console.log('[llmClient] OpenAI SDK 已加载');
} catch (e) {
    console.warn('[llmClient] OpenAI SDK 未安装，DeepSeek/Qwen 功能将不可用');
}

try {
    const googleModule = require('@google/genai');
    GoogleGenAI = googleModule.GoogleGenAI;
    console.log('[llmClient] @google/genai SDK 已加载');
} catch (e) {
    console.warn('[llmClient] @google/genai 未安装，Gemini 功能将不可用');
}

// ==================== 第三步：主入口函数 ====================

/**
 * 生成内容（多模态）
 *
 * @param {string} prompt - 文本提示词
 * @param {Array<string>} imagePaths - 图片路径数组（可选）
 * @param {Object} options - 额外选项
 * @param {string} options.modelType - 模型类型: 'vision' | 'text'
 * @returns {Promise<Object>} 生成结果 { success, text, error, provider }
 */
async function generateContent(prompt, imagePaths = [], options = {}) {
    try {
        // 优化：支持根据 modelType 选择视觉或文本模型
        let provider, modelName;

        if (options.modelType === 'vision' && llmConfig.getVisionModel) {
            // 使用视觉模型（用于多模态推理）
            const visionModel = llmConfig.getVisionModel();
            if (visionModel) {
                provider = visionModel.provider;
                modelName = visionModel.modelName;
                console.log(`[llmClient] 使用视觉模型: ${provider} / ${modelName}`);
            }
        } else if (options.modelType === 'text' && llmConfig.getTextModel) {
            // 使用文本模型（用于文本生成）
            const textModel = llmConfig.getTextModel();
            if (textModel) {
                provider = textModel.provider;
                modelName = textModel.modelName;
                console.log(`[llmClient] 使用文本模型: ${provider} / ${modelName}`);
            }
        }

        // 如果没有指定 modelType 或指定的模型未配置，回退到原有逻辑
        if (!provider || !modelName) {
            const activeConfig = llmConfig.getActiveModel ? llmConfig.getActiveModel() : null;
            provider = activeConfig?.provider || 'gemini';
            modelName = activeConfig?.modelName || 'gemini-2.5-flash';
            console.log(`[llmClient] 使用默认模型: ${provider} / ${modelName}`);
        }

        // 根据 provider 分发到对应实现
        switch (provider.toLowerCase()) {
            case 'gemini':
                return await generateWithGemini(prompt, imagePaths, modelName, options);
            case 'deepseek':
                return await generateWithDeepSeek(prompt, imagePaths, modelName, options);
            case 'bailian':
            case 'qwen':
            case 'aliyun':
                return await generateWithQwen(prompt, imagePaths, modelName, options);
            default:
                console.warn(`[llmClient] 未知的 provider: ${provider}，使用降级模式`);
                return generateFallbackResponse(prompt);
        }

    } catch (error) {
        console.error('[llmClient] 生成内容失败:', error.message);
        return {
            success: false,
            text: null,
            error: error.message,
            fallback: true
        };
    }
}

// ==================== 第四步：各平台实现 ====================

/**
 * Google Gemini 实现
 * 
 * 使用 @google/genai SDK，由于 globalThis.fetch 已被接管，
 * SDK 内部请求会自动走代理
 */
async function generateWithGemini(prompt, imagePaths, modelName, options) {
    try {
        if (!GoogleGenAI) {
            throw new Error('@google/genai SDK 未安装，请运行: npm install @google/genai');
        }

        const apiKey = getKey('gemini');
        if (!apiKey) {
            throw new Error('Gemini API Key 未配置');
        }

        // 直接初始化（globalThis.fetch 已被代理接管）
        const ai = new GoogleGenAI({ apiKey });

        // 构建内容
        const contents = [];

        if (imagePaths && imagePaths.length > 0) {
            for (const imagePath of imagePaths) {
                try {
                    const { base64, mimeType } = await loadImageAsBase64(imagePath);
                    contents.push({
                        inlineData: { data: base64, mimeType: mimeType }
                    });
                } catch (imgError) {
                    console.warn(`[llmClient] 加载图片失败 ${imagePath}:`, imgError.message);
                }
            }
        }

        contents.push({ text: prompt });

        console.log(`[llmClient] 发送 Gemini 请求，模型: ${modelName}`);

        const response = await ai.models.generateContent({
            model: modelName || 'gemini-1.5-flash',
            contents: contents,
            config: {
                temperature: options.temperature ?? 0.1,
                topP: options.topP ?? 0.85,
                maxOutputTokens: options.maxTokens ?? 800
            }
        });

        const text = response.text;

        console.log('[llmClient] Gemini 响应成功');

        return {
            success: true,
            text: text,
            error: null,
            provider: 'gemini',
            model: modelName
        };

    } catch (error) {
        console.error('[llmClient] Gemini 调用失败:', error.message);
        return handleGeminiError(error, prompt);
    }
}

/**
 * DeepSeek 实现 (OpenAI 兼容模式)
 * 
 * 使用 OpenAI SDK，通过 baseURL 指向 DeepSeek API
 */
async function generateWithDeepSeek(prompt, imagePaths, modelName, options) {
    try {
        if (!OpenAI) {
            throw new Error('OpenAI SDK 未安装，请运行: npm install openai');
        }

        const apiKey = getKey('deepseek');
        if (!apiKey) {
            throw new Error('DeepSeek API Key 未配置');
        }

        const openai = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey,
            httpAgent: proxyAgent // 显式注入代理
        });

        // DeepSeek 目前不支持多模态，忽略图片
        if (imagePaths && imagePaths.length > 0) {
            console.warn('[llmClient] DeepSeek 不支持图片输入，已忽略');
        }

        console.log(`[llmClient] 发送 DeepSeek 请求，模型: ${modelName}`);

        const response = await openai.chat.completions.create({
            model: modelName || 'deepseek-chat',
            messages: [
                { role: 'system', content: '你是一个专业的视障导航助手。' },
                { role: 'user', content: prompt }
            ],
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens ?? 800
        });

        const text = response.choices[0].message.content;

        console.log('[llmClient] DeepSeek 响应成功');

        return {
            success: true,
            text: text,
            error: null,
            provider: 'deepseek',
            model: modelName
        };

    } catch (error) {
        console.error('[llmClient] DeepSeek 调用失败:', error.message);
        return {
            success: false,
            text: null,
            error: error.message,
            provider: 'deepseek'
        };
    }
}

/**
 * 阿里云百炼 Qwen 实现 (OpenAI 兼容模式)
 * 
 * 使用 OpenAI SDK，通过 baseURL 指向 DashScope 兼容接口
 */
async function generateWithQwen(prompt, imagePaths, modelName, options) {
    try {
        if (!OpenAI) {
            throw new Error('OpenAI SDK 未安装，请运行: npm install openai');
        }

        const apiKey = getKey('bailian') || getKey('qwen') || getKey('aliyun');
        if (!apiKey) {
            throw new Error('阿里云百炼 API Key 未配置');
        }

        const openai = new OpenAI({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: apiKey,
            httpAgent: proxyAgent // 显式注入代理（保持统一性）
        });

        // 构建消息内容（支持多模态）
        const contentArr = [];

        // 文本部分
        contentArr.push({ type: 'text', text: prompt });

        // 图像部分（OpenAI 标准多模态格式）
        if (imagePaths && imagePaths.length > 0) {
            for (const imagePath of imagePaths) {
                try {
                    const { base64, mimeType } = await loadImageAsBase64(imagePath);
                    contentArr.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64}`
                        }
                    });
                } catch (imgError) {
                    console.warn(`[llmClient] 加载图片失败 ${imagePath}:`, imgError.message);
                }
            }
        }

        console.log(`[llmClient] 发送 Qwen 请求，模型: ${modelName}`);

        const response = await openai.chat.completions.create({
            model: modelName || 'qwen-vl-plus',
            messages: [
                { role: 'system', content: '你是一个专业的视障导航助手。' },
                { role: 'user', content: contentArr }
            ],
            temperature: options.temperature ?? 0.1,
            max_tokens: options.maxTokens ?? 800
        });

        const text = response.choices[0].message.content;

        console.log('[llmClient] Qwen 响应成功');

        return {
            success: true,
            text: text,
            error: null,
            provider: 'qwen',
            model: modelName
        };

    } catch (error) {
        console.error('[llmClient] Qwen 调用失败:', error.message);
        return {
            success: false,
            text: null,
            error: error.message,
            provider: 'qwen'
        };
    }
}

// ==================== 第五步：工具函数 ====================

/**
 * 加载图片并转换为 Base64
 * 支持 HTTP/HTTPS URL 和本地文件路径
 */
async function loadImageAsBase64(imagePath) {
    try {
        // 检查是否是 HTTP/HTTPS URL（从 Blind_map 获取的图片 URL）
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            console.log(`[llmClient] 从 URL 下载图片: ${imagePath}`);

            // 从 URL 下载图片（HTTP 请求不走代理，直接访问本地 Blind_map 服务）
            const response = await axios.get(imagePath, {
                responseType: 'arraybuffer',
                timeout: 10000,
                // 本地服务不需要代理
                proxy: false
            });

            const buffer = Buffer.from(response.data);

            // 从 URL 推断 MIME 类型
            const ext = path.extname(new URL(imagePath).pathname).toLowerCase();
            const mimeTypeMap = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            };

            // 优先使用响应的 Content-Type
            const contentType = response.headers['content-type'];
            const mimeType = contentType || mimeTypeMap[ext] || 'image/jpeg';
            const base64 = buffer.toString('base64');

            console.log(`[llmClient] URL 图片下载成功: ${imagePath}, 大小: ${buffer.length} bytes`);

            return { base64, mimeType };
        }

        // 本地文件路径处理（原有逻辑）
        const fullPath = path.isAbsolute(imagePath)
            ? imagePath
            : path.join(process.cwd(), '..', '..', imagePath);

        const buffer = await fs.readFile(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mimeTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        const mimeType = mimeTypeMap[ext] || 'image/jpeg';
        const base64 = buffer.toString('base64');

        return { base64, mimeType };
    } catch (error) {
        console.error(`[llmClient] 读取图片失败 ${imagePath}:`, error.message);
        throw error;
    }
}

/**
 * 处理 Gemini 错误
 */
function handleGeminiError(error, prompt) {
    let errorMessage = error.message;
    let errorCode = null;

    if (errorMessage.includes('429')) {
        errorMessage = '429 RESOURCE_EXHAUSTED - API 配额已用完或请求过于频繁';
        errorCode = '429';
    } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        errorMessage = '401/403 UNAUTHORIZED - API Key 无效或权限不足';
        errorCode = '401';
    } else if (errorMessage.includes('404')) {
        errorMessage = '404 NOT_FOUND - 模型不存在或不可用';
        errorCode = '404';
    } else if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ECONNRESET')) {
        errorMessage = `网络连接失败 - 请检查 VPN/代理是否正常工作 (当前代理: ${PROXY_URL})`;
        errorCode = 'NETWORK';
    }

    return {
        success: false,
        text: null,
        error: errorMessage,
        error_code: errorCode,
        provider: 'gemini',
        fallback: true
    };
}

/**
 * 生成降级响应
 */
function generateFallbackResponse(prompt, errorMessage = '') {
    console.log('[llmClient] 使用降级响应');

    let fallbackText = '';

    if (prompt.includes('导航') || prompt.includes('路线')) {
        fallbackText = `全程路线已规划完成。

12点钟方向直行，按照导航指引前进。

到达目的地。`;
    } else {
        fallbackText = '服务暂时不可用，请稍后重试。';
    }

    return {
        success: true,
        text: fallbackText,
        error: errorMessage || '使用了降级响应',
        fallback: true,
        provider: 'fallback'
    };
}

/**
 * 测试 LLM 客户端连通性
 */
async function testConnectivity() {
    const results = {
        gemini: false,
        deepseek: false,
        qwen: false
    };

    // 测试 Gemini
    if (getKey('gemini') && GoogleGenAI) {
        try {
            const result = await generateWithGemini('Hello', [], 'gemini-1.5-flash', { maxTokens: 10 });
            results.gemini = result.success;
        } catch (e) {
            console.warn('[llmClient] Gemini 测试失败:', e.message);
        }
    }

    // 测试 DeepSeek
    if (getKey('deepseek') && OpenAI) {
        try {
            const result = await generateWithDeepSeek('Hello', [], 'deepseek-chat', { maxTokens: 10 });
            results.deepseek = result.success;
        } catch (e) {
            console.warn('[llmClient] DeepSeek 测试失败:', e.message);
        }
    }

    // 测试 Qwen
    if ((getKey('bailian') || getKey('qwen')) && OpenAI) {
        try {
            const result = await generateWithQwen('Hello', [], 'qwen-vl-plus', { maxTokens: 10 });
            results.qwen = result.success;
        } catch (e) {
            console.warn('[llmClient] Qwen 测试失败:', e.message);
        }
    }

    return results;
}

// ==================== 第六步：导出 ====================

module.exports = {
    generateContent,
    testConnectivity,
    generateFallbackResponse
};

