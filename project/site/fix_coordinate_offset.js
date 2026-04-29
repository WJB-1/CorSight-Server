/**
 * 坐标偏移修正脚本
 * 
 * 问题：原始度分秒坐标转换为十进制后，与高德地图坐标存在明显偏移
 * 
 * 解决方案：
 * 1. 检查原始数据是否存在系统性偏差
 * 2. 应用坐标系转换（如需要）
 * 3. 批量更新数据库
 * 
 * 执行：
 *   cd navigation_agent/backend
 *   node ../project/site/fix_coordinate_offset.js
 */

const fs = require('fs');
const path = require('path');

// 添加 backend node_modules 路径
const backendPath = path.join(__dirname, '../../backend/node_modules');
module.paths.unshift(backendPath);

const { MongoClient } = require('mongodb');

// ==================== 已知参考点 ====================
// P001 在高德地图上的真实坐标
const REFERENCE_POINT = {
    point_id: 'P001',
    correct_lon: 113.328148,  // 高德地图经度
    correct_lat: 23.133652,   // 高德地图纬度
    raw_dms_lon: '113°19\'21"', // 原始度分秒经度
    raw_dms_lat: '23°8\'11"'    // 原始度分秒纬度
};

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

// ==================== 计算偏移量 ====================
function calculateOffset() {
    console.log('========================================');
    console.log('坐标偏移分析');
    console.log('========================================\n');

    // 原始度分秒转换结果
    const converted_lon = dmsToDecimal(REFERENCE_POINT.raw_dms_lon);
    const converted_lat = dmsToDecimal(REFERENCE_POINT.raw_dms_lat);

    console.log('参考点 P001:');
    console.log('  原始度分秒:');
    console.log(`    经度: ${REFERENCE_POINT.raw_dms_lon}`);
    console.log(`    纬度: ${REFERENCE_POINT.raw_dms_lat}`);
    console.log('  度分秒转换结果:');
    console.log(`    经度: ${converted_lon.toFixed(6)}`);
    console.log(`    纬度: ${converted_lat.toFixed(6)}`);
    console.log('  高德地图实际坐标:');
    console.log(`    经度: ${REFERENCE_POINT.correct_lon}`);
    console.log(`    纬度: ${REFERENCE_POINT.correct_lat}`);

    // 计算偏移
    const offset_lon = REFERENCE_POINT.correct_lon - converted_lon;
    const offset_lat = REFERENCE_POINT.correct_lat - converted_lat;

    console.log('\n  偏移量:');
    console.log(`    经度偏移: ${offset_lon.toFixed(6)}° (${(offset_lon * 111000 * Math.cos(23.13 * Math.PI / 180)).toFixed(1)}米)`);
    console.log(`    纬度偏移: ${offset_lat.toFixed(6)}° (${(offset_lat * 111000).toFixed(1)}米)`);

    return { offset_lon, offset_lat };
}

// ==================== 分析所有点的坐标范围 ====================
async function analyzeCoordinates() {
    require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('samplingpoints');

        const points = await collection.find({}).toArray();

        if (points.length === 0) {
            console.log('\n数据库中没有采样点');
            return;
        }

        // 计算边界
        const lons = points.map(p => p.longitude);
        const lats = points.map(p => p.latitude);

        console.log('\n\n========================================');
        console.log('数据库坐标范围分析');
        console.log('========================================');
        console.log(`总点数: ${points.length}`);
        console.log(`\n经度范围: ${Math.min(...lons).toFixed(6)} ~ ${Math.max(...lons).toFixed(6)}`);
        console.log(`纬度范围: ${Math.min(...lats).toFixed(6)} ~ ${Math.max(...lats).toFixed(6)}`);

        // 显示前5个点
        console.log('\n前5个点坐标:');
        points.slice(0, 5).forEach(p => {
            console.log(`  ${p.point_id}: (${p.longitude.toFixed(6)}, ${p.latitude.toFixed(6)})`);
        });

    } finally {
        await client.close();
    }
}

// ==================== 应用偏移修正 ====================
async function applyOffsetCorrection(offset_lon, offset_lat) {
    console.log('\n\n========================================');
    console.log('应用偏移修正');
    console.log('========================================');
    console.log(`偏移量: 经度 ${offset_lon.toFixed(6)}, 纬度 ${offset_lat.toFixed(6)}\n`);

    require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('samplingpoints');

        const points = await collection.find({}).toArray();
        let updatedCount = 0;

        for (const point of points) {
            const new_lon = point.longitude + offset_lon;
            const new_lat = point.latitude + offset_lat;

            await collection.updateOne(
                { point_id: point.point_id },
                {
                    $set: {
                        longitude: parseFloat(new_lon.toFixed(6)),
                        latitude: parseFloat(new_lat.toFixed(6)),
                        coordinate_offset_applied: true,
                        offset_correction_at: new Date()
                    }
                }
            );

            updatedCount++;
            console.log(`✅ ${point.point_id}: (${point.longitude.toFixed(6)}, ${point.latitude.toFixed(6)}) → (${new_lon.toFixed(6)}, ${new_lat.toFixed(6)})`);
        }

        console.log(`\n总计修正: ${updatedCount} 个点`);

        // 验证P001
        const p001 = await collection.findOne({ point_id: 'P001' });
        if (p001) {
            console.log('\n验证 P001:');
            console.log(`  修正后: (${p001.longitude.toFixed(6)}, ${p001.latitude.toFixed(6)})`);
            console.log(`  目标值: (${REFERENCE_POINT.correct_lon}, ${REFERENCE_POINT.correct_lat})`);
            const diff_lon = Math.abs(p001.longitude - REFERENCE_POINT.correct_lon);
            const diff_lat = Math.abs(p001.latitude - REFERENCE_POINT.correct_lat);
            console.log(`  误差: 经度 ${(diff_lon * 111000).toFixed(1)}米, 纬度 ${(diff_lat * 111000).toFixed(1)}米`);
        }

    } finally {
        await client.close();
    }
}

// ==================== 主函数 ====================
async function main() {
    // 1. 计算偏移
    const { offset_lon, offset_lat } = calculateOffset();

    // 2. 分析当前数据库
    await analyzeCoordinates();

    // 3. 询问是否应用修正
    console.log('\n\n是否应用偏移修正到所有采样点？');
    console.log('这将把所有坐标向高德地图坐标方向偏移');

    const shouldApply = process.argv.includes('--apply');

    if (shouldApply) {
        await applyOffsetCorrection(offset_lon, offset_lat);
    } else {
        console.log('\n提示: 添加 --apply 参数执行修正');
        console.log('命令: node fix_coordinate_offset.js --apply');
    }
}

main().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
});
