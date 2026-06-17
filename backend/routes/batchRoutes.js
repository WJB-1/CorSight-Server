/**
 * 批量任务路由
 *
 * GET  /pending      — 待处理批次
 * GET  /stats        — 批次统计
 * POST /trigger      — 手动触发
 * GET  /:batchId     — 批次详情
 */

const express = require('express');
const batchController = require('../controllers/batchController');

const router = express.Router();

router.get('/pending', batchController.getPending);
router.get('/stats', batchController.getStats);
router.post('/trigger', batchController.trigger);
router.get('/:batchId', batchController.getDetail);

module.exports = router;
