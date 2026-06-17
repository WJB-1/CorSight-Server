/**
 * 数据管理路由
 *
 * GET  /api/data/tags/pending     — 查询待注入标签
 * GET  /api/data/tags/stats       — 标签状态统计
 * POST /api/data/inject           — 手动触发注入
 * GET  /api/data/gh/status        — GraphHopper 状态
 * POST /api/data/gh/rebuild       — 手动触发重建
 * GET  /api/data/workspace        — OSM 工作区状态
 */

const express = require('express');
const dataController = require('../controllers/dataController');

const router = express.Router();

// ── 标签管理 ──────────────────────────────────────
router.get('/tags/pending', dataController.getPendingTags);
router.get('/tags/stats', dataController.getTagStats);

// ── 注入与重建 ────────────────────────────────────
router.post('/inject', dataController.triggerInjection);
router.post('/gh/rebuild', dataController.triggerRebuild);

// ── 状态查询 ──────────────────────────────────────
router.get('/gh/status', dataController.getGraphHopperStatus);
router.get('/workspace', dataController.getWorkspaceStatus);

module.exports = router;
