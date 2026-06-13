/**
 * 临时上传 Session（MongoDB TTL 集合）
 *
 * 状态机：
 *   metadata_received → partial_upload → complete → batched → processing → done | failed
 *   batched = 已进入批量队列，等待处理
 *   processing = VLM 正在分析
 */

const mongoose = require('mongoose');
const uploadConfig = require('../config/uploadConfig');

const imageEntrySchema = new mongoose.Schema(
  {
    fov: { type: Number, default: 90 },                  // 水平视场角（度）
    description: { type: String, default: '' },
    uploaded: { type: Boolean, default: false },
    path: { type: String, default: null },

    // ── 场景分类结果（由 sceneClassifier 填充） ─────
    scene_type: { type: String, default: null },          // steps/crossing/overpass/subway/path/generic
    scene_context: { type: mongoose.Schema.Types.Mixed, default: null }, // 分类上下文（OSM 元素等）
    status: { type: String, default: 'pending' },         // pending → classified → processed
  },
  { _id: false }
);

const uploadSessionSchema = new mongoose.Schema({
  session_id: { type: String, required: true, unique: true, index: true },
  point_id: { type: String, required: true, index: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  scene_description: { type: String, default: '' },
  // key = bearing (字符串), value = imageEntrySchema
  images: { type: Map, of: imageEntrySchema, default: {} },

  // ── 批量处理 ───────────────────────────────────
  batch_id: { type: String, default: null, index: true },

  status: {
    type: String,
    enum: [
      'metadata_received',
      'partial_upload',
      'complete',
      'batched',          // ★ 新增：已进入批量队列
      'processing',
      'done',
      'failed',
    ],
    default: 'metadata_received',
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  expireAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

// 复合索引
uploadSessionSchema.index({ point_id: 1, status: 1 });
uploadSessionSchema.index({ status: 1, updated_at: 1 }); // 缓存池扫描用

const UploadSession = mongoose.model('UploadSession', uploadSessionSchema, 'pending_uploads');

module.exports = UploadSession;
