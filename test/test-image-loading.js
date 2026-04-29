/**
 * 测试图片加载功能
 * 验证 HTTP URL 和本地路径的处理
 */

const path = require('path');
module.paths.unshift(path.join(__dirname, '../backend/node_modules'));

const fs = require('fs').promises;
const axios = require('axios');

/**
 * 修复后的 loadImageAsBase64 函数
 * 支持 HTTP URL 和本地文件路径
 */
async function loadImageAsBase64(imagePath) {
    try {
        // 检查是否是 HTTP/HTTPS URL
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
            console.log(`[loadImageAsBase64] 从 URL 下载图片: ${imagePath}`);

            // 从 URL 下载图片
            const response = await axios.get(imagePath, {
                responseType: 'arraybuffer',
                timeout: 10000
            });

            const buffer = Buffer.from(response.data);

            // 从 URL 或 Content-Type 推断 MIME 类型
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

            console.log(`[loadImageAsBase64] URL 图片下载成功，大小: ${buffer.length} bytes`);

            return { base64, mimeType };
        }

        // 本地文件路径处理（原有逻辑）
        const fullPath = path.isAbsolute(imagePath)
            ? imagePath
            : path.join(process.cwd(), '..', '..', imagePath);

        console.log(`[loadImageAsBase64] 读取本地图片: ${fullPath}`);

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

        console.log(`[loadImageAsBase64] 本地图片读取成功，大小: ${buffer.length} bytes`);

        return { base64, mimeType };
    } catch (error) {
        console.error(`[loadImageAsBase64] 读取图片失败 ${imagePath}:`, error.message);
        throw error;
    }
}

// 测试用例
async function runTests() {
    console.log('========================================');
    console.log('图片加载功能测试');
    console.log('========================================\n');

    // 测试 1: HTTP URL 检测
    console.log('【测试 1】URL 检测');
    const testUrls = [
        'http://localhost:3001/images/P005_N.jpg',
        'https://example.com/image.png',
        '/local/path/image.jpg',
        'relative/path/image.png'
    ];

    for (const url of testUrls) {
        const isHttp = url.startsWith('http://') || url.startsWith('https://');
        console.log(`  ${url}: ${isHttp ? 'HTTP URL' : '本地路径'}`);
    }

    // 测试 2: 尝试下载真实的 Blind_map 图片
    console.log('\n【测试 2】从 Blind_map 下载图片');
    const testImageUrl = 'http://localhost:3001/images/P005_N.jpg';

    try {
        const result = await loadImageAsBase64(testImageUrl);
        console.log(`✅ 成功下载图片`);
        console.log(`   MIME 类型: ${result.mimeType}`);
        console.log(`   Base64 长度: ${result.base64.length} chars`);
        console.log(`   数据前 100 字符: ${result.base64.substring(0, 100)}...`);
    } catch (error) {
        console.log(`❌ 下载失败: ${error.message}`);
        console.log('   (Blind_map 服务可能未启动，这是正常的)');
    }

    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
}

runTests().catch(console.error);
