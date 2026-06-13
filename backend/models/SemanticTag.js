/**
 * 永久语义标签存储（VLM 分析结果）
 *
 * 存储的内容：
 * 1. images[] — 每张图片的独立分析结果，含 bearing+fov 扇区信息
 *    → 行前预览 RAG 检索时，按行进方向匹配前方扇区的标签和描述
 * 2. merged_osm_tags — 多图融合后的结构化标签
 *    → 注入 OSM（key=value 格式，如 tactile_paving=yes）
 * 3. merged_description — 多图融合后的自然语言描述
 *    → 路线预览 RAG 时作为 LLM 上下文（不是注入 OSM 用的）
 *
 * 注入 OSM 的只有 merged_osm_tags（结构化标签），
 * merged_description 存在 MongoDB 里供路线预览时检索使用。
 *
 * status 状态机：
 *   pending → patched（已注入 OSM）
 *   pending → failed （匹配或注入失败）
 *   failed  → pending（手动重试）
 */

const mongoose = require('mongoose');

const imageAnalysisSchema = new mongoose.Schema(
  {
    bearing: { type: Number, required: true },
    fov: { type: Number, default: 90 },
    path: { type: String, required: true },
    scene_type: { type: String, default: null },
    agent_name: { type: String, default: null },
    osm_tags: { type: mongoose.Schema.Types.Mixed, default: {} },
    description: { type: String, default: '' },
    confidence: { type: Number, default: null },
  },
  { _id: false }
);

const semanticTagSchema = new mongoose.Schema({
  point_id: { type: String, required: true, unique: true, index: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  scene_description: { type: String, default: '' },

  // ── 每张图片的独立分析结果（RAG 按方位检索用） ──
  images: { type: [imageAnalysisSchema], default: [] },

  // ── 融合后的合并标签（注入 OSM 用） ─────────────
  merged_osm_tags: { type: mongoose.Schema.Types.Mixed, default: {} },
  merged_description: { type: String, default: '' },

  // ── OSM 匹配信息（由 Python 脚本填充） ──────────
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
  error: { type: String, default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// 2dsphere 空间索引
semanticTagSchema.index({ location: '2dsphere' });

// 便捷方法
semanticTagSchema.statics.findPending = function () {
  return this.find({ status: 'pending' }).lean();
};

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

semanticTagSchema.statics.markFailed = async function (pointId, errorMsg) {
  return this.findOneAndUpdate(
    { point_id: pointId },
    { status: 'failed', error: errorMsg, updated_at: new Date() }
  );
};

const SemanticTag = mongoose.model('SemanticTag', semanticTagSchema, 'semantic_tags');

module.exports = SemanticTag;
