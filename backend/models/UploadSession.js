/**
 * 临时上传 Session（MongoDB TTL 集合）
 *
 * 状态机：metadata_received → partial_upload → complete → processing → done | failed
 * 文档会在创建后 24h 自动过期删除。
 */

const mongoose = require('mongoose');
const config = require('../config/uploadConfig');

const imageEntrySchema = new mongoose.Schema(
  {
    description: { type: String, default: '' },
    uploaded: { type: Boolean, default: false },
    path: { type: String, default: null },
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
  status: {
    type: String,
    enum: ['metadata_received', 'partial_upload', 'complete', 'processing', 'done', 'failed'],
    default: 'metadata_received',
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  // TTL 过期字段：创建时设为 now + 24h
  expireAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

// 复合索引：按 point_id + status 查询（防重复提交）
uploadSessionSchema.index({ point_id: 1, status: 1 });

const UploadSession = mongoose.model('UploadSession', uploadSessionSchema, 'pending_uploads');

module.exports = UploadSession;
