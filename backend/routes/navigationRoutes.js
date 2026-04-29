/**
 * 导航路由
 * 
 * 模块 3.3：API 路由定义
 * 暴露导航预览相关接口
 * 
 * @module navigationRoutes
 */

const express = require('express');
const router = express.Router();
const previewController = require('../controllers/previewController');

/**
 * @route   POST /api/navigation/preview
 * @desc    生成导航预览的中间表示 (IR)
 * @access  Public
 * 
 * Request Body:
 * {
 *   "origin": "116.434307,39.90909",
 *   "destination": "116.434446,39.90816"
 * }
 */
router.post('/preview', previewController.generatePreview);

/**
 * @route   GET /api/navigation/preview/test
 * @desc    测试端点 - 使用预设坐标测试完整流程
 * @access  Public
 */
router.get('/preview/test', previewController.testPreview);

/**
 * @route   GET /api/navigation/preview/health
 * @desc    健康检查 - 测试高德 API 连通性和中间件功能
 * @access  Public
 */
router.get('/preview/health', previewController.healthCheck);

module.exports = router;
