/**
 * 道路增强标签（用户手动编辑的道路级标签）
 *
 * 与 SemanticTag（采集点 VLM 分析）不同：
 * - SemanticTag 是按 point_id 组织的点状标签
 * - RoadTag 是按 osm_id 组织的道路级标签
 *
 * 注入 OSM 时，RoadTag 优先级高于 SemanticTag（人工 > 自动）
 */

const mongoose = require('mongoose');

const roadTagSchema = new mongoose.Schema({
  osm_id: { type: Number, required: true },
  osm_type: { type: String, enum: ['way', 'node', 'relation'], default: 'way' },
  tags: { type: mongoose.Schema.Types.Mixed, default: {} },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'injected', 'failed'],
    default: 'pending',
    index: true,
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// 每个 osm_id 最多一条增强记录
roadTagSchema.index({ osm_id: 1 }, { unique: true });

const RoadTag = mongoose.model('RoadTag', roadTagSchema, 'road_tags');

module.exports = RoadTag;
