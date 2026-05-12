/**
 * 从 Blind_map 项目导入街景数据到 navigation_agent 数据库
 * 解决模块 2.3 采样点数据不显示的问题
 */

require('dotenv').config({ override: false, silent: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config/envConfig');
const { SamplingPoint } = require('../models/SamplingPoint');

// 数据库连接配置
const DB_URI = config.database.MONGODB_URI;

// Blind_map 数据路径
const BLINDMAP_DATA_PATH = path.join(__dirname, '../../../Blind_map/backend/public/map_data.json');
const BLINDMAP_IMAGES_PATH = path.join(__dirname, '../../../Blind_map/backend/public/images');

/**
 * 连接数据库
 */
async function connectDB() {
  try {
    await mongoose.connect(DB_URI);
    console.log('✅ 数据库连接成功');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    process.exit(1);
  }
}

/**
 * 从 Blind_map 导入数据
 */
async function importFromBlindMap() {
  console.log('========================================');
  console.log('🔄 开始导入 Blind_map 街景数据...');
  console.log('========================================\n');

  // 检查 Blind_map 数据文件是否存在
  if (!fs.existsSync(BLINDMAP_DATA_PATH)) {
    console.error(`❌ 找不到数据文件: ${BLINDMAP_DATA_PATH}`);
    console.log('请确保 Blind_map 项目存在于正确的位置');
    process.exit(1);
  }

  // 读取数据
  console.log(`📖 读取数据文件: ${BLINDMAP_DATA_PATH}`);
  const rawData = fs.readFileSync(BLINDMAP_DATA_PATH, 'utf-8');
  const blindMapData = JSON.parse(rawData);

  console.log(`📊 共读取 ${blindMapData.length} 条采样点数据\n`);

  // 清空现有数据（可选）
  const clearExisting = process.argv.includes('--clear');
  if (clearExisting) {
    console.log('🗑️  清空现有数据...');
    await SamplingPoint.deleteMany({});
    console.log('✅ 现有数据已清空\n');
  }

  // 统计信息
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // 导入数据
  for (const item of blindMapData) {
    try {
      // 检查是否已存在
      const existing = await SamplingPoint.findOne({ point_id: item.point_id });
      if (existing) {
        console.log(`⏭️  跳过已存在的采样点: ${item.point_id}`);
        skipped++;
        continue;
      }

      // 转换坐标格式
      // Blind_map: coordinates: { longitude, latitude }
      // MongoDB: coordinates: { type: 'Point', coordinates: [longitude, latitude] }
      const newPoint = new SamplingPoint({
        point_id: item.point_id,
        coordinates: {
          type: 'Point',
          coordinates: [item.coordinates.longitude, item.coordinates.latitude]
        },
        scene_description: item.scene_description || '',
        images: item.images || {},
        status: 'synced'
      });

      await newPoint.save();
      console.log(`✅ 导入成功: ${item.point_id} (${item.coordinates.longitude}, ${item.coordinates.latitude})`);
      imported++;

    } catch (error) {
      console.error(`❌ 导入失败 ${item.point_id}:`, error.message);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('📈 导入统计:');
  console.log(`   成功导入: ${imported}`);
  console.log(`   跳过重复: ${skipped}`);
  console.log(`   导入失败: ${errors}`);
  console.log(`   总计处理: ${blindMapData.length}`);
  console.log('========================================\n');

  // 验证空间索引
  console.log('🔍 检查空间索引...');
  try {
    const indexes = await SamplingPoint.collection.getIndexes();
    const hasGeoIndex = Object.values(indexes).some(
      idx => idx.key && idx.key['coordinates'] === '2dsphere'
    );
    
    if (hasGeoIndex) {
      console.log('✅ GeoJSON 空间索引已建立\n');
    } else {
      console.log('⚠️  警告: 空间索引未找到，请检查模型定义\n');
    }
  } catch (error) {
    console.error('❌ 检查索引失败:', error.message);
  }
}

/**
 * 测试查询
 */
async function testQuery() {
  console.log('🧪 测试查询功能...');
  
  // 使用 Blind_map 中第一个点的坐标测试
  const rawData = fs.readFileSync(BLINDMAP_DATA_PATH, 'utf-8');
  const blindMapData = JSON.parse(rawData);
  
  if (blindMapData.length > 0) {
    const testPoint = blindMapData[0];
    const lat = testPoint.coordinates.latitude;
    const lon = testPoint.coordinates.longitude;
    
    console.log(`\n📍 测试坐标: (${lat}, ${lon})`);
    console.log(`🔍 搜索半径: 500 米\n`);

    try {
      const points = await SamplingPoint.find({
        coordinates: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [lon, lat]
            },
            $maxDistance: 500
          }
        }
      });

      console.log(`✅ 查询成功，找到 ${points.length} 个采样点:`);
      points.forEach(p => {
        console.log(`   - ${p.point_id}: (${p.coordinates.coordinates[1]}, ${p.coordinates.coordinates[0]})`);
      });

    } catch (error) {
      console.error('❌ 查询失败:', error.message);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 连接数据库
    await connectDB();

    // 导入数据
    await importFromBlindMap();

    // 测试查询
    await testQuery();

    console.log('\n🎉 数据导入完成！');
    console.log('现在刷新前端页面，应该能看到街景标记了。\n');

  } catch (error) {
    console.error('\n❌ 导入过程出错:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 数据库连接已关闭');
  }
}

// 运行
main();
