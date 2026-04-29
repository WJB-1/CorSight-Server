/**
 * 坐标转换与修复脚本
 *
 * 功能：
 * 1. 读取 map_data.json.txt
 * 2. 将度分秒格式（如 23°8′14″）转换为十进制
 * 3. 修复经度/纬度标签互换的问题
 * 4. 更新数据库中的坐标
 *
 * 执行：
 *   cd navigation_agent/backend
 *   node ../project/site/fix_coordinates.js --update
 */

const fs = require('fs');
const path = require('path');

// 添加 backend node_modules 路径
const backendPath = path.join(__dirname, '../../backend/node_modules');
module.paths.unshift(backendPath);

const { MongoClient } = require('mongodb');

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'map_data.json.txt');

/**
 * 度分秒转十进制
 * 格式: 23°8′14″ 或 23° 8′ 14″ (支持空格)
 * @param {string} dms - 度分秒字符串
 * @returns {number} 十进制坐标
 */
function dmsToDecimal(dms) {
    if (!dms || typeof dms !== 'string') {
        return null;
    }

    // 清理字符串: 去除所有空格
    dms = dms.toString().replace(/\s+/g, '').trim();

    // 匹配度分秒格式: 数字°数字′数字″ (支持可选空格)
    const match = dms.match(/(\d+)°(\d+)′(\d+)″?/);
    if (!match) {
        console.warn(`无法解析格式: ${dms}`);
        return null;
    }

    const degrees = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);

    // 转换为十进制: 度 + 分/60 + 秒/3600
    const decimal = degrees + minutes / 60 + seconds / 3600;

    return parseFloat(decimal.toFixed(6)); // 保留6位小数
}

/**
 * 解析数据文件
 * 文件格式是多个 JSON 对象拼接，不是标准 JSON 数组
 */
function parseDataFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // 使用正则提取所有 point 对象
    const points = [];
    const regex = /\{\s*"point_id"\s*:\s*"([^"]+)"[\s\S]*?"coordinates"\s*:\s*\{\s*"longitude"\s*:\s*([^,]+),\s*"latitude"\s*:\s*([^\}]+)\}[\s\S]*?"scene_description"\s*:\s*"([^"]*)"[\s\S]*?\}/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
        const pointId = match[1].trim();
        const longitudeRaw = match[2].trim(); // 实际上是纬度
        const latitudeRaw = match[3].trim();  // 实际上是经度
        const sceneDesc = match[4].trim();

        // 转换坐标（注意：原始数据中标签互换了）
        const lat = dmsToDecimal(longitudeRaw);  // 原始 longitude 字段存的是纬度
        const lon = dmsToDecimal(latitudeRaw);   // 原始 latitude 字段存的是经度

        if (lat !== null && lon !== null) {
            points.push({
                point_id: pointId,
                original: {
                    longitude: longitudeRaw,
                    latitude: latitudeRaw
                },
                converted: {
                    longitude: lon,  // 正确的经度
                    latitude: lat    // 正确的纬度
                },
                scene_description: sceneDesc
            });
        }
    }

    return points;
}

/**
 * 更新数据库坐标
 */
async function updateDatabase(points) {
    // 从后端配置读取 MongoDB 连接字符串
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';

    console.log(`\n连接数据库: ${mongoUri}`);

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log('数据库连接成功');

        const db = client.db();
        const collection = db.collection('samplingpoints'); // 根据实际集合名调整

        let updatedCount = 0;
        let notFoundCount = 0;

        for (const point of points) {
            const result = await collection.updateOne(
                { point_id: point.point_id },
                {
                    $set: {
                        longitude: point.converted.longitude,
                        latitude: point.converted.latitude,
                        coordinates_updated_at: new Date(),
                        coordinates_source: 'site/map_data.json.txt - DMS converted'
                    }
                }
            );

            if (result.matchedCount > 0) {
                updatedCount++;
                console.log(`✅ ${point.point_id}: (${point.converted.longitude}, ${point.converted.latitude})`);
            } else {
                notFoundCount++;
                console.log(`⚠️ ${point.point_id}: 数据库中未找到`);
            }
        }

        console.log(`\n更新完成:`);
        console.log(`  - 成功更新: ${updatedCount} 条`);
        console.log(`  - 未找到: ${notFoundCount} 条`);

    } catch (error) {
        console.error('数据库操作失败:', error.message);
    } finally {
        await client.close();
        console.log('数据库连接已关闭');
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('========================================');
    console.log('坐标转换与修复工具');
    console.log('========================================\n');

    // 1. 检查文件是否存在
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`错误: 文件不存在 ${DATA_FILE}`);
        process.exit(1);
    }

    // 2. 解析数据
    console.log('正在解析数据文件...');
    const points = parseDataFile(DATA_FILE);
    console.log(`找到 ${points.length} 个采样点\n`);

    if (points.length === 0) {
        console.error('未解析到任何数据');
        process.exit(1);
    }

    // 3. 显示转换示例
    console.log('转换示例 (前3条):');
    console.log('────────────────────────────────────────');
    points.slice(0, 3).forEach(p => {
        console.log(`\nPoint: ${p.point_id}`);
        console.log(`  原始数据:`);
        console.log(`    longitude: ${p.original.longitude}`);
        console.log(`    latitude: ${p.original.latitude}`);
        console.log(`  修复后:`);
        console.log(`    longitude: ${p.converted.longitude}`);
        console.log(`    latitude: ${p.converted.latitude}`);
        console.log(`  场景: ${p.scene_description.substring(0, 30)}...`);
    });

    console.log('\n\n注意: 原始数据中经度和纬度标签互换了，已自动修复');
    console.log('      longitude 字段存的是纬度值 → 转换为纬度');
    console.log('      latitude 字段存的是经度值 → 转换为经度');

    // 4. 询问是否更新数据库
    console.log('\n\n是否更新数据库? (输入 yes 确认)');

    // 在脚本中默认执行更新，可以通过参数控制
    const shouldUpdate = process.argv.includes('--update');

    if (shouldUpdate) {
        await updateDatabase(points);
    } else {
        console.log('\n提示: 添加 --update 参数执行数据库更新');
        console.log('命令: node fix_coordinates.js --update');
    }

    // 5. 保存转换结果到文件
    const outputFile = path.join(__dirname, 'coordinates_converted.json');
    fs.writeFileSync(outputFile, JSON.stringify(points, null, 2), 'utf-8');
    console.log(`\n转换结果已保存: ${outputFile}`);
}

// 执行
main().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});
