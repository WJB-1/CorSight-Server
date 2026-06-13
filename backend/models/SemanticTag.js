/**
 * 永久语义标签存储（VLM 分析结果 + OSM 匹配状态）
 *
 * status 状态机：
 *   pending → patched   （已注入 OSM）
 *   pending → failed    （匹配或注入失败）
 *   failed  → pending   （手动重试）
 */

const mongoose = require('mongoose');

const semanticTagSchema = new mongoose.Schema({
  point_id: { type: String, required: true, unique: true, index: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  tags: { type: mongoose.Schema.Types.Mixed, default: {} },
  images: { type: [String], default: [] },
  scene_description: { type: String, default: '' },

  // ── OSM 匹配信息（由 Python 脚本填充） ─────────
  matched_osm_id: { type: Number, default: null },
  matched_osm_type: { type: String, enum: ['way', 'node', null], default: null },
  match_distance_m: { type: Number, default: null },

  // ── 注入状态 ───────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'patched', 'failed'],
    default: 'pending',
    index: true,
  },
  error: { type: String, default: null }, // 失败原因

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// 2dsphere 空间索引
semanticTagSchema.index({ location: '2dsphere' });

// 便捷方法：获取待注入的标签
semanticTagSchema.statics.findPending = function () {
  return this.find({ status: 'pending' }).lean();
};

// 便捷方法：标记为已注入
semanticTagSchema.statics.markPatched = async function (pointId, osmInfo) {
  return this.findOneAndUpdate(
    { point_id: pointId },
    {
      status: 'patched',
      matched_osm_id: osmInfo.osm_id,
      matched_osm_type: osmInfo.osm_type,
      match_distance_m: osmInfo.distance_m,
      updated_at: new Date(),
    }
  );
};

// 便捷方法：标记失败
semanticTagSchema.statics.markFailed = async function (pointId, errorMsg) {
  return this.findOneAndUpdate(
    { point_id: pointId },
    { status: 'failed', error: errorMsg, updated_at: new Date() }
  );
};

const SemanticTag = mongoose.model('SemanticTag', semanticTagSchema, 'semantic_tags');

module.exports = SemanticTag;
