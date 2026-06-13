/**
 * 批量任务控制器
 */

const BatchTask = require('../models/BatchTask');
const batchProcessorService = require('../services/batchProcessorService');

/**
 * 查询待处理批次
 * GET /api/batch/pending
 */
async function getPending(req, res) {
  try {
    const batches = await batchProcessorService.getPendingBatches();
    return res.json({ success: true, count: batches.length, data: batches });
  } catch (err) {
    console.error('[BatchController] getPending error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 批次统计
 * GET /api/batch/stats
 */
async function getStats(req, res) {
  try {
    const [pending, processing, completed, failed, total] = await Promise.all([
      BatchTask.countDocuments({ status: 'pending' }),
      BatchTask.countDocuments({ status: 'processing' }),
      BatchTask.countDocuments({ status: 'completed' }),
      BatchTask.countDocuments({ status: 'failed' }),
      BatchTask.countDocuments(),
    ]);
    return res.json({
      success: true,
      data: { total, pending, processing, completed, failed },
    });
  } catch (err) {
    console.error('[BatchController] getStats error:', err);
    return res.status(500).json({ success: false, message: '统计失败' });
  }
}

/**
 * 手动触发处理 pending 的批次
 * POST /api/batch/trigger
 */
async function trigger(req, res) {
  try {
    const result = await batchProcessorService.triggerPending();
    return res.json({
      success: true,
      message: `已触发 ${result.triggered} 个批次`,
      data: result,
    });
  } catch (err) {
    console.error('[BatchController] trigger error:', err);
    return res.status(500).json({ success: false, message: '触发失败' });
  }
}

/**
 * 查询批次详情
 * GET /api/batch/:batchId
 */
async function getDetail(req, res) {
  try {
    const batch = await batchProcessorService.getBatchDetail(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: '批次不存在' });
    }
    return res.json({ success: true, data: batch });
  } catch (err) {
    console.error('[BatchController] getDetail error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

module.exports = { getPending, getStats, trigger, getDetail };
