/**
 * 重新计算坐标脚本
 * 
 * 问题：原始度分秒坐标本身存在偏差，需要基于P001正确坐标重新推算
 * 
 * 策略：
 * 1. P001使用高德地图坐标反推出的度分秒
 * 2. 其他点保持相对偏移量不变，基于P001重新计算
 * 
 * 执行：
 *   cd navigation_agent/backend
 *   node ../project/site/recalculate_coordinates.js --apply
 */

const fs = require('fs');
const path = require('path');

// 添加 backend node_modules 路径
const backendPath = path.join(__dirname, '../../backend/node_modules');
module.paths.unshift(backendPath);

const { MongoClient } = require('mongodb');

// ==================== 参考点（高德地图真实坐标）====================
const REFERENCE = {
    point_id: 'P001',
    // 高德地图十进制坐标
    decimal_lon: 113.328148,
    decimal_lat: 23.133652,
    // 反推出的度分秒（用于替换原始数据）
    dms_lon: "113°19'41''",
    dms_lat: "23°8'1''"
};

// ==================== 十进制转度分秒 ====================
function decimalToDMS(decimal, isLongitude) {
    const degrees = Math.floor(decimal);
    const minutesFloat = (decimal - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60);

    return `${degrees}°${minutes}'${seconds}''`;
}

// ==================== 度分秒转十进制 ====================
function dmsToDecimal(dms) {
    if (!dms || typeof dms !== 'string') return null;

    let cleaned = dms.toString().replace(/\s+/g, '');
    cleaned = cleaned
        .replace(/''/g, '″')
        .replace(/'/g, '′')
        .replace(/"/g, '″');

    const match = cleaned.match(/(\d+)°(\d+)′(\d+)″?/);
    if (!match) return null;

    const degrees = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);

    return degrees + minutes / 60 + seconds / 3600;
}

// ==================== 主函数 ====================
async function main() {
    console.log('========================================');
    console.log('重新计算坐标');
    console.log('========================================\n');

    // 1. 读取原始数据
    const dataFile = path.join(__dirname, 'map_data.json');
    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);

    console.log(`读取到 ${data.length} 个采样点\n`);

    // 2. 找到P001的原始坐标
    const p001 = data.find(p => p.point_id === 'P001');
    if (!p001) {
        console.error('错误: 未找到P001');
        process.exit(1);
    }

    const p001_original_lon = dmsToDecimal(p001.coordinates.latitude); // 原始latitude存的是经度
    const p001_original_lat = dmsToDecimal(p001.coordinates.longitude); // 原始longitude存的是纬度

    console.log('P001原始坐标:');
    console.log(`  度分秒: ${p001.coordinates.longitude}, ${p001.coordinates.latitude}`);
    console.log(`  十进制: ${p001_original_lon.toFixed(6)}, ${p001_original_lat.toFixed(6)}`);
    console.log('\nP001目标坐标（高德）:');
    console.log(`  十进制: ${REFERENCE.decimal_lon}, ${REFERENCE.decimal_lat}`);
    console.log(`  度分秒: ${REFERENCE.dms_lon}, ${REFERENCE.dms_lat}\n`);

    // 3. 计算偏移量
    const offset_lon = REFERENCE.decimal_lon - p001_original_lon;
    const offset_lat = REFERENCE.decimal_lat - p001_original_lat;

    console.log(`全局偏移量: 经度 ${offset_lon.toFixed(6)}, 纬度 ${offset_lat.toFixed(6)}\n`);

    // 4. 修正所有点
    const correctedData = data.map(point => {
        // 原始十进制（标签互换）
        const raw_lon = dmsToDecimal(point.coordinates.latitude);
        const raw_lat = dmsToDecimal(point.coordinates.longitude);

        // 应用偏移
        const corrected_lon = raw_lon + offset_lon;
        const corrected_lat = raw_lat + offset_lat;

        // 转回度分秒（注意标签互换）
        const new_dms_lat = decimalToDMS(corrected_lon, true);  // 存到longitude字段
        const new_dms_lon = decimalToDMS(corrected_lat, false); // 存到latitude字段

        return {
            ...point,
            coordinates: {
                longitude: new_dms_lon, // 实际存纬度
                latitude: new_dms_lat   // 实际存经度
            },
            corrected_decimal: {
                longitude: corrected_lon,
                latitude: corrected_lat
            }
        };
    });

    // 5. 显示修正结果
    console.log('修正结果（前5个点）:');
    console.log('────────────────────────────────────────');
    correctedData.slice(0, 5).forEach(p => {
        console.log(`\n${p.point_id}:`);
        console.log(`  原始: ${data.find(d => d.point_id === p.point_id).coordinates.longitude}, ${data.find(d => d.point_id === p.point_id).coordinates.latitude}`);
        console.log(`  修正: ${p.coordinates.longitude}, ${p.coordinates.latitude}`);
        console.log(`  十进: ${p.corrected_decimal.longitude.toFixed(6)}, ${p.corrected_decimal.latitude.toFixed(6)}`);
    });

    // 6. 保存修正后的JSON
    const outputFile = path.join(__dirname, 'map_data_corrected.json');
    fs.writeFileSync(outputFile, JSON.stringify(correctedData, null, 2), 'utf-8');
    console.log(`\n\n修正后的数据已保存: ${outputFile}`);

    // 7. 询问是否更新数据库
    const shouldApply = process.argv.includes('--apply');

    if (shouldApply) {
        await updateDatabase(correctedData);
        // 同时更新原始文件
        fs.writeFileSync(dataFile, JSON.stringify(correctedData, null, 2), 'utf-8');
        console.log(`原始文件已更新: ${dataFile}`);
    } else {
        console.log('\n提示: 添加 --apply 参数执行数据库更新');
        console.log('命令: node recalculate_coordinates.js --apply');
    }
}

// ==================== 更新数据库 ====================
async function updateDatabase(points) {
    require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('samplingpoints');

        let updatedCount = 0;

        for (const point of points) {
            await collection.updateOne(
                { point_id: point.point_id },
                {
                    $set: {
                        longitude: parseFloat(point.corrected_decimal.longitude.toFixed(6)),
                        latitude: parseFloat(point.corrected_decimal.latitude.toFixed(6)),
                        coordinates_dms: {
                            longitude: point.coordinates.longitude,
                            latitude: point.coordinates.latitude
                        },
                        recalculated_at: new Date()
                    }
                }
            );
            updatedCount++;
            console.log(`✅ ${point.point_id}: (${point.corrected_decimal.longitude.toFixed(6)}, ${point.corrected_decimal.latitude.toFixed(6)})`);
        }

        console.log(`\n总计更新: ${updatedCount} 个点`);

        // 验证P001
        const p001 = await collection.findOne({ point_id: 'P001' });
        if (p001) {
            console.log('\n验证 P001:');
            console.log(`  数据库: (${p001.longitude}, ${p001.latitude})`);
            console.log(`  目标值: (${REFERENCE.decimal_lon}, ${REFERENCE.decimal_lat})`);
        }

    } finally {
        await client.close();
    }
}

main().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});
