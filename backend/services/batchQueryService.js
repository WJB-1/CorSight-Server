/**
 * 批量任务查询服务
 *
 * 封装 BatchTask Model 的查询操作，
 * 消除 batchController 直接依赖 Model 的分层违规。
 */

const BatchTask = require('../models/BatchTask');

/**
 * 查询待处理的 batch
 */
async function findPending() {
  return BatchTask.findPending();
}

/**
 * 按状态统计
 */
async function countByStatus() {
  const [pending, processing, completed, failed, total] = await Promise.all([
    BatchTask.countDocuments({ status: 'pending' }),
    BatchTask.countDocuments({ status: 'processing' }),
    BatchTask.countDocuments({ status: 'completed' }),
    BatchTask.countDocuments({ status: 'failed' }),
    BatchTask.countDocuments(),
  ]);
  return { total, pending, processing, completed, failed };
}

/**
 * 查询单个 batch 详情
 */
async function findByBatchId(batchId) {
  return BatchTask.findByBatchId(batchId);
}

module.exports = { findPending, countByStatus, findByBatchId };
