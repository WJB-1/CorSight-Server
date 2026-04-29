const mongoose = require('mongoose');

/**
 * 采样点数据模型
 * 与 Blind_map 项目共享数据库，使用相同的 Schema 结构
 */
const samplingPointSchema = new mongoose.Schema({
  // 采样点唯一标识符
  point_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // 地理坐标（GeoJSON Point 格式）
  // 注意：与 Blind_map 保持一致，使用 'location' 字段名
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },

  // 场景描述
  scene_description: {
    type: String,
    default: ''
  },

  // 8个方位的图片路径
  images: {
    N: { type: String, default: null },
    NE: { type: String, default: null },
    E: { type: String, default: null },
    SE: { type: String, default: null },
    S: { type: String, default: null },
    SW: { type: String, default: null },
    W: { type: String, default: null },
    NW: { type: String, default: null }
  }
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt
  collection: 'sampling_points' // 与 Blind_map 使用相同的集合名
});

// 为 GeoJSON 坐标建立 2dsphere 索引
samplingPointSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SamplingPoint', samplingPointSchema);
