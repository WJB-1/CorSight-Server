/**
 * 修复 P001 数据
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_URI = 'mongodb://localhost:27017/blind_map';

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
  scene_description: { 
    type: String, 
    default: '' 
  },
  images: {
    N: String, NE: String, E: String, SE: String,
    S: String, SW: String, W: String, NW: String
  }
}, { 
  timestamps: true, 
  collection: 'sampling_points' 
});

async function fixP001() {
  try {
    console.log('🔄 连接到数据库...');
    await mongoose.connect(DB_URI);
    console.log('✅ 连接成功\n');
    
    const SamplingPoint = mongoose.model('SamplingPoint', samplingPointSchema);
    
    // 读取原始数据
    const rawData = fs.readFileSync(path.join(__dirname, '../data_pipeline/map_data.json'), 'utf-8');
    const data = JSON.parse(rawData);
    const p001Data = data.find(p => p.point_id === 'P001');
    
    console.log('📖 原始数据中的 P001:');
    console.log('  - point_id:', p001Data.point_id);
    console.log('  - scene_description:', JSON.stringify(p001Data.scene_description));
    console.log('  - images:', JSON.stringify(p001Data.images));
    console.log();
    
    // 查看当前数据库中的 P001
    const current = await SamplingPoint.findOne({ point_id: 'P001' });
    console.log('💾 数据库中当前的 P001:');
    if (current) {
      console.log('  - point_id:', current.point_id);
      console.log('  - scene_description:', JSON.stringify(current.scene_description));
      console.log('  - images:', JSON.stringify(current.images));
    } else {
      console.log('  - 不存在');
    }
    console.log();
    
    // 删除旧的 P001
    const delResult = await SamplingPoint.deleteOne({ point_id: 'P001' });
    console.log('🗑️  删除结果:', delResult);
    console.log();
    
    // 创建新的 P001
    const newP001 = new SamplingPoint({
      point_id: p001Data.point_id,
      location: {
        type: 'Point',
        coordinates: [p001Data.coordinates.longitude, p001Data.coordinates.latitude]
      },
      scene_description: p001Data.scene_description || '',
      images: {
        N: p001Data.images.N,
        NE: p001Data.images.NE,
        E: p001Data.images.E,
        SE: p001Data.images.SE,
        S: p001Data.images.S,
        SW: p001Data.images.SW,
        W: p001Data.images.W,
        NW: p001Data.images.NW
      }
    });
    
    const saved = await newP001.save();
    console.log('✅ 保存成功!');
    console.log('  - point_id:', saved.point_id);
    console.log('  - scene_description:', JSON.stringify(saved.scene_description));
    console.log('  - images:', JSON.stringify(saved.images));
    console.log();
    
    // 验证
    const verify = await SamplingPoint.findOne({ point_id: 'P001' });
    console.log('🔍 验证结果:');
    console.log('  - point_id:', verify.point_id);
    console.log('  - scene_description:', JSON.stringify(verify.scene_description));
    console.log('  - images:', JSON.stringify(verify.images));
    
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 数据库连接已关闭');
  }
}

fixP001();
