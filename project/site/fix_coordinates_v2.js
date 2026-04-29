/**
 * 坐标转换与修复脚本 V2
 * 
 * 针对 map_data.json (标准JSON格式) 优化
 * - 处理单引号格式: 23°8'11''
 * - 修复经度/纬度标签互换
 * - 检测并报告异常坐标（如133度）
 * 
 * 执行:
 *   cd navigation_agent/backend
 *   node ../project/site/fix_coordinates_v2.js --update
 */

const fs = require('fs');
const path = require('path');

// 添加 backend node_modules 路径
const backendPath = path.join(__dirname, '../../backend/node_modules');
module.paths.unshift(backendPath);

const { MongoClient } = require('mongodb');

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'map_data.json');

/**
 * 度分秒转十进制
 * 支持格式:
 *   - 23°8'11'' (单引号)
 *   - 23° 8′ 11″ (Unicode分秒符号 + 空格)
 * @param {string} dms - 度分秒字符串
 * @param {string} field - 字段名（用于错误报告）
 * @returns {object} { value: number, error: string|null }
 */
function dmsToDecimal(dms, field) {
    if (!dms || typeof dms !== 'string') {
        return { value: null, error: '空值' };
    }

    // 清理字符串: 去除所有空格
    let cleaned = dms.toString().replace(/\s+/g, '');

    // 检查异常值
    if (cleaned.includes('133°')) {
        return { value: null, error: '异常经度133°（应为113°左右）' };
    }

    // 替换各种分秒符号为标准格式
    cleaned = cleaned
        .replace(/''/g, '″')     // 双单引号转为秒符号
        .replace(/'/g, '′')      // 单引号转为分符号
        .replace(/"/g, '″');     // 双引号转为秒符号

    // 匹配度分秒: 数字°数字′数字″
    const match = cleaned.match(/(\d+)°(\d+)′(\d+)″?/);
    if (!match) {
        return { value: null, error: `无法解析格式: ${dms}` };
    }

    const degrees = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);

    // 验证范围
    if (degrees > 180) {
        return { value: null, error: `度数过大: ${degrees}°` };
    }
    if (minutes >= 60 || seconds >= 60) {
        return { value: null, error: `分或秒超过60` };
    }

    // 转换为十进制
    const decimal = degrees + minutes / 60 + seconds / 3600;

    return {
        value: parseFloat(decimal.toFixed(6)),
        error: null
    };
}

/**
 * 解析JSON数据文件
 */
function parseDataFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
        throw new Error('JSON数据不是数组格式');
    }

    const points = [];
    const errors = [];

    for (const item of data) {
        const pointId = item.point_id;

        // 原始数据（注意标签互换）
        const lonRaw = item.coordinates?.longitude; // 实际上是纬度
        const latRaw = item.coordinates?.latitude;  // 实际上是经度

        // 转换坐标（标签互换修复）
        const latResult = dmsToDecimal(lonRaw, 'longitude'); // 原始longitude存的是纬度
        const lonResult = dmsToDecimal(latRaw, 'latitude');  // 原始latitude存的是经度

        // 检查错误
        if (latResult.error || lonResult.error) {
            errors.push({
                point_id: pointId,
                raw: { longitude: lonRaw, latitude: latRaw },
                errors: {
                    latitude: latResult.error,
                    longitude: lonResult.error
                }
            });
            continue;
        }

        points.push({
            point_id: pointId,
            original: {
                longitude: lonRaw,
                latitude: latRaw
            },
            converted: {
                longitude: lonResult.value,  // 正确的经度
                latitude: latResult.value    // 正确的纬度
            },
            scene_description: item.scene_description || '',
            images: item.images
        });
    }

    return { points, errors };
}

/**
 * 更新数据库
 */
async function updateDatabase(points) {
    // 从 backend/.env 加载配置
    require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';

    console.log(`\n连接数据库: ${mongoUri}`);

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log('数据库连接成功');

        const db = client.db();
        const collection = db.collection('samplingpoints');

        let updatedCount = 0;
        let insertedCount = 0;
        let notFoundCount = 0;

        for (const point of points) {
            // 先尝试查找
            const existing = await collection.findOne({ point_id: point.point_id });

            if (existing) {
                // 更新现有记录
                await collection.updateOne(
                    { point_id: point.point_id },
                    {
                        $set: {
                            longitude: point.converted.longitude,
                            latitude: point.converted.latitude,
                            coordinates_updated_at: new Date(),
                            coordinates_source: 'site/map_data.json - DMS converted v2'
                        }
                    }
                );
                updatedCount++;
                console.log(`✅ ${point.point_id}: 已更新 (${point.converted.longitude}, ${point.converted.latitude})`);
            } else {
                // 插入新记录
                await collection.insertOne({
                    point_id: point.point_id,
                    longitude: point.converted.longitude,
                    latitude: point.converted.latitude,
                    scene_description: point.scene_description,
                    images: point.images,
                    coordinates_updated_at: new Date(),
                    coordinates_source: 'site/map_data.json - DMS converted v2'
                });
                insertedCount++;
                console.log(`🆕 ${point.point_id}: 已插入 (${point.converted.longitude}, ${point.converted.latitude})`);
            }
        }

        console.log(`\n操作完成:`);
        console.log(`  - 成功更新: ${updatedCount} 条`);
        console.log(`  - 成功插入: ${insertedCount} 条`);
        console.log(`  - 总计: ${updatedCount + insertedCount} 条`);

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
    console.log('坐标转换与修复工具 V2');
    console.log('========================================\n');

    // 1. 检查文件
    if (!fs.existsSync(DATA_FILE)) {
        console.error(`错误: 文件不存在 ${DATA_FILE}`);
        process.exit(1);
    }

    // 2. 解析数据
    console.log('正在解析 map_data.json...');
    const { points, errors } = parseDataFile(DATA_FILE);

    console.log(`\n解析结果:`);
    console.log(`  - 成功: ${points.length} 个采样点`);
    console.log(`  - 错误: ${errors.length} 个采样点`);

    // 3. 显示错误详情
    if (errors.length > 0) {
        console.log('\n⚠️  错误详情:');
        console.log('────────────────────────────────────────');
        errors.forEach(e => {
            console.log(`\n${e.point_id}:`);
            console.log(`  原始: longitude=${e.raw.longitude}, latitude=${e.raw.latitude}`);
            if (e.errors.longitude) console.log(`  经度错误: ${e.errors.longitude}`);
            if (e.errors.latitude) console.log(`  纬度错误: ${e.errors.latitude}`);
        });
    }

    if (points.length === 0) {
        console.error('\n没有可处理的数据');
        process.exit(1);
    }

    // 4. 显示转换示例
    console.log('\n\n转换示例 (前5条):');
    console.log('────────────────────────────────────────');
    points.slice(0, 5).forEach(p => {
        console.log(`\n${p.point_id}:`);
        console.log(`  原始 → 修复后:`);
        console.log(`    longitude: ${p.original.longitude} → ${p.converted.longitude}`);
        console.log(`    latitude:  ${p.original.latitude} → ${p.converted.latitude}`);
    });

    console.log('\n\n✅ 已自动修复经度/纬度标签互换问题');

    // 5. 保存转换结果
    const outputFile = path.join(__dirname, 'coordinates_converted_v2.json');
    fs.writeFileSync(outputFile, JSON.stringify({
        points,
        errors,
        summary: {
            total: points.length + errors.length,
            success: points.length,
            failed: errors.length,
            timestamp: new Date().toISOString()
        }
    }, null, 2), 'utf-8');
    console.log(`\n转换结果已保存: ${outputFile}`);

    // 6. 询问是否更新数据库
    const shouldUpdate = process.argv.includes('--update');

    if (shouldUpdate && points.length > 0) {
        await updateDatabase(points);
    } else {
        console.log('\n提示: 添加 --update 参数执行数据库更新');
        console.log('命令: node fix_coordinates_v2.js --update');
    }
}

main().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});

