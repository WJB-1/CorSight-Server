/**
 * 永久语义标签存储（VLM 分析结果）
 */

const mongoose = require('mongoose');

const semanticTagSchema = new mongoose.Schema({
  point_id: { type: String, required: true, unique: true, index: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  tags: { type: mongoose.Schema.Types.Mixed, default: {} },
  images: { type: [String], default: [] }, // 相对 URL 列表
  scene_description: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
});

// 2dsphere 空间索引
semanticTagSchema.index({ location: '2dsphere' });

const SemanticTag = mongoose.model('SemanticTag', semanticTagSchema, 'semantic_tags');

module.exports = SemanticTag;
