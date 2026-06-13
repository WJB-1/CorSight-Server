/**
 * 路线规划 + 行前预览路由
 *
 * POST /route — 路线规划（可选行前预览）
 */

const express = require('express');
const navigationController = require('../controllers/navigationController');

const router = express.Router();

router.post('/route', navigationController.route);

module.exports = router;
