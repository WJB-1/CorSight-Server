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
const fixedRouteController = require('../controllers/fixedRoutePreviewController');

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

/**
 * @route   GET /api/navigation/preview/fixed
 * @desc    列出所有可用的固定路线
 * @access  Public
 */
router.get('/preview/fixed', fixedRouteController.listFixedRoutes);

/**
 * @route   POST /api/navigation/preview/fixed/:routeId
 * @desc    生成固定路线预览（跳过高德路线规划，直接用采样点坐标）
 * @access  Public
 *
 * 可用路线:
 *   - gzdx_stadium: 广大生活区公交站→体育场（广州大学城校区，经天桥）
 *
 * Request Body (可选):
 * {
 *   "options": {
 *     "enable_perception": false,
 *     "enable_broadcast": true
 *   }
 * }
 */
router.post('/preview/fixed/:routeId', fixedRouteController.generateFixedPreview);

module.exports = router;
