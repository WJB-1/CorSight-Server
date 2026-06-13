/**
 * 批量任务（管理 VLM 批量推理的生命周期）
 *
 * 一个 BatchTask 对应一批 session 的 VLM 分析任务。
 */

const mongoose = require('mongoose');

const batchTaskSchema = new mongoose.Schema({
  batch_id: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  session_ids: { type: [String], default: [] },
  total_images: { type: Number, default: 0 },
  processed_images: { type: Number, default: 0 },

  // 按场景类型分组的统计
  groups: { type: mongoose.Schema.Types.Mixed, default: {} },

  error: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// 便捷方法
batchTaskSchema.statics.findPending = function () {
  return this.find({ status: { $in: ['pending', 'processing'] } }).lean();
};

batchTaskSchema.statics.findByBatchId = function (batchId) {
  return this.findOne({ batch_id: batchId }).lean();
};

const BatchTask = mongoose.model('BatchTask', batchTaskSchema, 'batch_tasks');

module.exports = BatchTask;
