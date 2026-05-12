/**
 * 清理 Blind_map 数据库中的测试数据
 * 只保留 P001-P033 格式的正式采样点
 */

const mongoose = require('mongoose');

// 数据库连接配置
const DB_URI = 'mongodb://localhost:27017/blind_map';

// 定义采样点 Schema（与项目一致）
const samplingPointSchema = new mongoose.Schema({
  point_id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  location: {
    type: { 
      type: String, 
      enum: ['Point'], 
      default: 'Point' 
    },
    coordinates: { 
      type: [Number], 
      required: true 
    }
  },
  scene_description: { type: String, default: '' },
  images: {
    N: String, NE: String, E: String, SE: String,
    S: String, SW: String, W: String, NW: String
  }
}, { 
  timestamps: true, 
  collection: 'sampling_points' 
});

// 创建模型
const SamplingPoint = mongoose.model('SamplingPoint', samplingPointSchema);

async function cleanupTestData() {
  try {
    console.log('🔄 连接到 Blind_map 数据库...');
    await mongoose.connect(DB_URI);
    console.log('✅ 数据库连接成功\n');
    
    // 获取所有采样点
    const allPoints = await SamplingPoint.find({});
    console.log(`📊 数据库中共有 ${allPoints.length} 个采样点`);
    
    // 筛选出测试数据（不符合 P001-P033 格式的）
    const testPoints = allPoints.filter(p => !/^P\d{3}$/.test(p.point_id));
    console.log(`⚠️  发现 ${testPoints.length} 个测试数据需要清理：`);
    testPoints.forEach(p => {
      console.log(`   - ${p.point_id}: ${p.scene_description}`);
    });
    
    if (testPoints.length === 0) {
      console.log('\n✅ 没有发现测试数据，数据库已清理！');
      return;
    }
    
    // 删除测试数据
    console.log('\n🗑️  开始清理测试数据...');
    for (const point of testPoints) {
      await SamplingPoint.deleteOne({ point_id: point.point_id });
      console.log(`   ✅ 已删除: ${point.point_id}`);
    }
    
    // 验证清理结果
    const remainingPoints = await SamplingPoint.find({});
    console.log(`\n📊 清理后剩余 ${remainingPoints.length} 个采样点：`);
    remainingPoints.forEach(p => {
      console.log(`   - ${p.point_id}`);
    });
    
    console.log('\n✅ 测试数据清理完成！');
    
  } catch (error) {
    console.error('❌ 清理失败:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 数据库连接已关闭');
  }
}

// 执行清理
cleanupTestData();
