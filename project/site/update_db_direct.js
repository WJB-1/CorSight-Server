/**
 * 直接强制更新数据库坐标
 * 
 * 使用方法:
 *   cd navigation_agent/backend
 *   node ../project/site/update_db_direct.js
 */

const path = require('path');
module.paths.unshift(path.join(__dirname, '../../backend/node_modules'));

const { MongoClient } = require('mongodb');

// P001 的正确坐标（高德地图）
const CORRECT_COORDS = {
    'P001': { lon: 113.328148, lat: 23.133652 },
    'P002': { lon: 113.330092, lat: 23.133374 },
    'P003': { lon: 113.330648, lat: 23.132819 },
    'P004': { lon: 113.330926, lat: 23.133374 },
    'P005': { lon: 113.333704, lat: 23.133374 },
    'P006': { lon: 113.334537, lat: 23.132819 },
    'P007': { lon: 113.335370, lat: 23.133096 },
    'P008': { lon: 113.335926, lat: 23.133096 },
    'P009': { lon: 113.336481, lat: 23.133096 },
    'P010': { lon: 113.337870, lat: 23.133652 },
    'P011': { lon: 113.339259, lat: 23.134208 },
    'P012': { lon: 113.340370, lat: 23.134763 },
    'P013': { lon: 113.342315, lat: 23.135319 },
    'P014': { lon: 113.344815, lat: 23.136430 },
    'P015': { lon: 113.328426, lat: 23.134485 },
    'P016': { lon: 113.328426, lat: 23.133096 },
    'P017': { lon: 113.328426, lat: 23.132263 },
    'P018': { lon: 113.328426, lat: 23.130874 },
    'P019': { lon: 113.328148, lat: 23.127819 },
    'P020': { lon: 113.327870, lat: 23.126152 },
    'P021': { lon: 113.327870, lat: 23.125874 },
    'P022': { lon: 113.328148, lat: 23.125041 },
    'P023': { lon: 113.328148, lat: 23.123930 },
    'P024': { lon: 113.327315, lat: 23.122819 },
    'P025': { lon: 113.325648, lat: 23.122819 },
    'P026': { lon: 113.325648, lat: 23.122541 },
    'P027': { lon: 113.326481, lat: 23.120874 },
    'P028': { lon: 113.326481, lat: 23.120874 },
    'P029': { lon: 113.326204, lat: 23.119763 },
    'P030': { lon: 113.326204, lat: 23.119485 },
    'P031': { lon: 113.326759, lat: 23.118652 },
    'P032': { lon: 113.326759, lat: 23.118652 },
    'P033': { lon: 113.332592, lat: 23.118096 }
};

async function main() {
    console.log('========================================');
    console.log('强制更新数据库坐标');
    console.log('========================================\n');

    const mongoUri = 'mongodb://localhost:27017/blind_map';
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        console.log('数据库已连接\n');

        const db = client.db();
        const col = db.collection('samplingpoints');

        let updated = 0;

        for (const [pointId, coords] of Object.entries(CORRECT_COORDS)) {
            const result = await col.updateOne(
                { point_id: pointId },
                {
                    $set: {
                        longitude: coords.lon,
                        latitude: coords.lat,
                        location: {
                            type: 'Point',
                            coordinates: [coords.lon, coords.lat]
                        },
                        force_updated_at: new Date()
                    }
                },
                { upsert: true }
            );

            if (result.modifiedCount > 0 || result.upsertedCount > 0) {
                updated++;
                console.log(`✅ ${pointId}: (${coords.lon}, ${coords.lat})`);
            } else {
                console.log(`⚠️  ${pointId}: 未修改`);
            }
        }

        console.log(`\n总计更新: ${updated} 个点`);

        // 验证P001
        const p001 = await col.findOne({ point_id: 'P001' });
        console.log('\n验证 P001:');
        console.log(`  longitude: ${p001?.longitude}`);
        console.log(`  latitude: ${p001?.latitude}`);

    } catch (err) {
        console.error('错误:', err.message);
    } finally {
        await client.close();
        console.log('\n数据库连接已关闭');
    }
}

main();
