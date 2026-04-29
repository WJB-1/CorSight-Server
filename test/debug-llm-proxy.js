/**
 * LLM 代理连接调试脚本
 *
 * 用于诊断代理配置和 API 连接问题
 */

// 设置模块路径以加载 backend 的依赖
const path = require('path');
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
module.paths.unshift(backendNodeModules);

console.log('========================================');
console.log('LLM 代理连接调试工具');
console.log('========================================\n');

// 步骤 1: 检查环境变量
console.log('[步骤 1] 检查环境变量');
console.log('----------------------------------------');
console.log(`HTTP_PROXY:  ${process.env.HTTP_PROXY || '(未设置)'}`);
console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || '(未设置)'}`);
console.log(`NO_PROXY:    ${process.env.NO_PROXY || '(未设置)'}`);
console.log(`PROXY_PORT:  ${process.env.PROXY_PORT || '(未设置，默认 7890)'}`);
console.log('');

// 步骤 2: 加载 .env
const fs = require('fs');

function loadEnv() {
    const envPath = path.join(__dirname, '..', 'backend', '.env');
    console.log(`[步骤 2] 尝试加载 .env: ${envPath}`);
    console.log('----------------------------------------');

    if (!fs.existsSync(envPath)) {
        console.log('❌ .env 文件不存在');
        return;
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
        if (line.includes('=') && !line.startsWith('#')) {
            const [key, value] = line.split('=', 2);
            if (key && value) {
                const cleanKey = key.trim();
                const cleanValue = value.trim().replace(/^["']|["']$/g, '');
                process.env[cleanKey] = cleanValue;

                // 只显示 API Key 的前 20 个字符
                if (cleanKey.includes('KEY') && cleanValue) {
                    const masked = cleanValue.substring(0, 20) + '...';
                    console.log(`${cleanKey}: ${masked}`);
                } else if (!cleanKey.includes('KEY')) {
                    console.log(`${cleanKey}: ${cleanValue}`);
                }
            }
        }
    }
    console.log('');
}

loadEnv();

// 步骤 3: 检查代理端口连通性
console.log('[步骤 3] 检查代理端口连通性');
console.log('----------------------------------------');

const net = require('net');

function checkProxyPort(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);

        socket.on('connect', () => {
            console.log(`✅ 代理端口 ${host}:${port} 可连接`);
            socket.destroy();
            resolve(true);
        });

        socket.on('error', (err) => {
            console.log(`❌ 代理端口 ${host}:${port} 连接失败: ${err.message}`);
            resolve(false);
        });

        socket.on('timeout', () => {
            console.log(`⏱️  代理端口 ${host}:${port} 连接超时`);
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

async function testProxyPorts() {
    // 常见代理端口
    const ports = [7890, 10809, 1080, 8080, 7897];
    const workingPorts = [];

    for (const port of ports) {
        const working = await checkProxyPort('127.0.0.1', port);
        if (working) {
            workingPorts.push(port);
        }
    }

    console.log('');
    if (workingPorts.length === 0) {
        console.log('⚠️  警告: 未检测到可用的代理端口');
        console.log('   请确保 VPN/代理软件已启动');
        console.log('   常见软件默认端口: Clash(7890), v2rayN(10809), Shadowsocks(1080)');
    } else {
        console.log(`✅ 可用代理端口: ${workingPorts.join(', ')}`);
        console.log('   建议: 在 backend/.env 中设置 PROXY_PORT=' + workingPorts[0]);
    }
    console.log('');

    return workingPorts;
}

// 步骤 4: 测试 Gemini API 连接
async function testGeminiConnection() {
    console.log('[步骤 4] 测试 Gemini API 连接');
    console.log('----------------------------------------');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('❌ GEMINI_API_KEY 未配置');
        return;
    }

    console.log('API Key 已配置');
    console.log('尝试使用 https-proxy-agent 连接...\n');

    try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
        const agent = new HttpsProxyAgent(proxyUrl);

        const fetch = require('node-fetch');

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        console.log(`代理: ${proxyUrl}`);
        console.log(`请求: ${url.substring(0, 60)}...\n`);

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'GET',
            agent: agent
        });
        const elapsed = Date.now() - startTime;

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Gemini API 连接成功 (${elapsed}ms)`);
            console.log(`可用模型数: ${data.models?.length || 0}`);
        } else {
            const errorText = await response.text();
            console.log(`❌ Gemini API 请求失败 (${elapsed}ms)`);
            console.log(`状态码: ${response.status}`);
            console.log(`错误: ${errorText.substring(0, 200)}`);
        }

    } catch (error) {
        console.log(`❌ Gemini 连接测试失败: ${error.message}`);
        if (error.message.includes('ECONNREFUSED')) {
            console.log('   提示: 代理端口可能不正确');
        }
    }
    console.log('');
}

// 步骤 5: 测试 SDK 加载
function checkSDKs() {
    console.log('[步骤 5] 检查 SDK 安装状态');
    console.log('----------------------------------------');

    const sdks = [
        { name: 'https-proxy-agent', required: true },
        { name: 'node-fetch', required: true },
        { name: 'openai', required: true },
        { name: '@google/genai', required: true }
    ];

    for (const sdk of sdks) {
        try {
            require(sdk.name);
            console.log(`✅ ${sdk.name}`);
        } catch (e) {
            console.log(`❌ ${sdk.name} - ${sdk.required ? '必需' : '可选'}`);
            console.log(`   安装命令: npm install ${sdk.name}`);
        }
    }
    console.log('');
}

// 运行所有测试
async function runDiagnostics() {
    await testProxyPorts();
    checkSDKs();
    await testGeminiConnection();

    console.log('========================================');
    console.log('诊断完成');
    console.log('========================================');
    console.log('\n解决建议:');
    console.log('1. 如果代理端口不通，请检查 VPN 是否开启');
    console.log('2. 如果 SDK 未安装，请运行: npm install https-proxy-agent node-fetch openai @google/genai');
    console.log('3. 如果 Gemini 连接失败，请检查 API Key 是否正确');
    console.log('4. 在 backend/.env 中设置正确的 PROXY_PORT');
}

runDiagnostics().catch(console.error);
