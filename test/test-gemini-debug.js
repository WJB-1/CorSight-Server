/**
 * Gemini API 调试脚本
 * 
 * 问题：Node.js 默认不走系统代理，导致请求被防火墙拦截
 * 解决：添加代理环境变量
 */

// ==================== 方案 1: 环境变量代理配置 ====================
// 在文件最顶部设置代理（请根据你的 VPN 端口修改）
// 常见代理端口：Clash 默认 7890, v2rayN 默认 10809

const PROXY_PORT = process.env.PROXY_PORT || '7890';

// 设置代理环境变量
process.env.HTTP_PROXY = `http://127.0.0.1:${PROXY_PORT}`;
process.env.HTTPS_PROXY = `http://127.0.0.1:${PROXY_PORT}`;
process.env.NO_PROXY = 'localhost,127.0.0.1';

console.log(`[调试] 代理配置: HTTP_PROXY=${process.env.HTTP_PROXY}`);

// ==================== 加载依赖 ====================
const fs = require('fs');
const path = require('path');

// 加载 .env 配置
function loadEnv() {
    const envPath = path.join(__dirname, '..', 'backend', '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('=') && !line.startsWith('#')) {
                const [key, value] = line.split('=', 2);
                if (key && value) {
                    process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
                }
            }
        }
    }
}

loadEnv();

// ==================== 测试配置 ====================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TEST_IMAGE_PATH = path.join(__dirname, 'test.png'); // 请准备一个测试图片

// 候选模型列表（根据成功测试的模型）
const CANDIDATE_MODELS = [
    'gemini-3-flash-preview',          // ✅ 测试成功
    'gemini-3.1-flash-lite-preview',   // ✅ 测试成功
    'gemini-robotics-er-1.5-preview',  // ✅ 测试成功
    'gemini-3.1-pro-preview',          // ❌ 配额超限
    'gemini-1.5-pro',                  // 备选
    'gemini-1.5-flash'                 // 备选
];

// ==================== 测试函数 ====================

/**
 * 测试新版 SDK (@google/genai)
 */
async function testWithNewSDK(modelName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试模型 (新版 SDK): ${modelName}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
        const { GoogleGenAI } = require('@google/genai');

        // 创建客户端
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // 准备内容
        let contents = [];

        // 如果有测试图片，添加图片
        if (fs.existsSync(TEST_IMAGE_PATH)) {
            const imageData = fs.readFileSync(TEST_IMAGE_PATH);
            const base64Image = imageData.toString('base64');
            contents.push({
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/png'
                }
            });
            console.log('[调试] 已加载测试图片');
        }

        // 添加文本提示
        contents.push({
            text: '这是一张测试图片。请只回复"OK"两个字，不要添加任何其他内容。'
        });

        console.log('[调试] 发送请求...');

        // 发送请求
        const response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config: {
                temperature: 0,
                maxOutputTokens: 10
            }
        });

        const elapsed = Date.now() - startTime;
        const text = response.text || '';

        console.log(`✅ 成功 (${elapsed}ms)`);
        console.log(`响应: ${text.substring(0, 100)}`);

        return {
            success: true,
            model: modelName,
            responseTime: elapsed,
            response: text,
            sdk: 'new (@google/genai)'
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ 失败 (${elapsed}ms)`);
        console.log(`错误: ${error.message}`);

        // 如果是网络错误，提示代理问题
        if (error.message.includes('fetch') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('socket')) {
            console.log('\n⚠️  网络错误提示:');
            console.log('   这可能是代理问题，请检查:');
            console.log('   1. VPN 是否已开启');
            console.log('   2. 代理端口是否正确 (当前设置: ' + PROXY_PORT + ')');
            console.log('   3. 修改脚本中的 PROXY_PORT 变量为你的实际代理端口');
        }

        return {
            success: false,
            model: modelName,
            responseTime: elapsed,
            error: error.message,
            sdk: 'new (@google/genai)'
        };
    }
}

/**
 * 测试旧版 SDK (@google/generative-ai)
 */
async function testWithOldSDK(modelName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试模型 (旧版 SDK): ${modelName}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: modelName });

        const contents = [];

        if (fs.existsSync(TEST_IMAGE_PATH)) {
            const imageData = fs.readFileSync(TEST_IMAGE_PATH);
            const base64Image = imageData.toString('base64');
            contents.push({
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/png'
                }
            });
            console.log('[调试] 已加载测试图片');
        }

        contents.push({
            text: '这是一张测试图片。请只回复"OK"两个字，不要添加任何其他内容。'
        });

        console.log('[调试] 发送请求...');

        const result = await model.generateContent({ contents });
        const response = await result.response;
        const text = response.text();

        const elapsed = Date.now() - startTime;

        console.log(`✅ 成功 (${elapsed}ms)`);
        console.log(`响应: ${text.substring(0, 100)}`);

        return {
            success: true,
            model: modelName,
            responseTime: elapsed,
            response: text,
            sdk: 'old (@google/generative-ai)'
        };

    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.log(`❌ 失败 (${elapsed}ms)`);
        console.log(`错误: ${error.message}`);

        return {
            success: false,
            model: modelName,
            responseTime: elapsed,
            error: error.message,
            sdk: 'old (@google/generative-ai)'
        };
    }
}

/**
 * 运行所有测试
 */
async function runTests() {
    console.log('Gemini API 调试测试');
    console.log('====================');
    console.log(`API Key: ${GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 20) + '...' : '未配置'}`);
    console.log(`测试图片: ${TEST_IMAGE_PATH} ${fs.existsSync(TEST_IMAGE_PATH) ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`代理端口: ${PROXY_PORT}`);

    if (!GEMINI_API_KEY) {
        console.error('❌ 错误: GEMINI_API_KEY 未配置');
        console.log('请在 backend/.env 文件中设置 GEMINI_API_KEY');
        process.exit(1);
    }

    const results = [];

    // 测试新版 SDK
    console.log('\n\n📦 测试新版 SDK (@google/genai)');
    console.log('='.repeat(60));

    for (const model of CANDIDATE_MODELS) {
        const result = await testWithNewSDK(model);
        results.push(result);

        // 等待一下避免频率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 打印汇总
    console.log('\n\n📊 测试结果汇总');
    console.log('='.repeat(60));

    const successCount = results.filter(r => r.success).length;
    console.log(`总计: ${results.length} 个模型`);
    console.log(`成功: ${successCount}`);
    console.log(`失败: ${results.length - successCount}`);

    console.log('\n详细结果:');
    for (const result of results) {
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${result.model} (${result.responseTime}ms) - ${result.sdk}`);
        if (!result.success) {
            console.log(`   错误: ${result.error.substring(0, 80)}...`);
        }
    }

    // 保存结果到文件
    const outputPath = path.join(__dirname, 'gemini-test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 结果已保存到: ${outputPath}`);
}

// 运行测试
runTests().catch(console.error);
