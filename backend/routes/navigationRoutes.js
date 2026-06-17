/**
 * 导航路由
 *
 * GET  /points — 获取所有采样点（前端地图标注用）
 * POST /route  — 路线规划（可选行前预览）
 */

const express = require('express');
const navigationController = require('../controllers/navigationController');

const router = express.Router();

router.get('/points', navigationController.getPoints);
router.post('/route', navigationController.route);

module.exports = router;
