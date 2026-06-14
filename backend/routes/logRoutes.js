/**
 * 日志 SSE 路由
 *
 * GET /api/logs/stream — 后端所有日志的 SSE 流
 *
 * 推送的日志类型：
 * - type: 'log'      — console.log/warn/error/info 输出
 * - type: 'request'  — HTTP 请求 method/url/status/duration
 * - type: 'connected'— SSE 连接确认
 */

const express = require('express');
const { logStreamHandler } = require('../middleware/logger');

const router = express.Router();

router.get('/stream', logStreamHandler);

module.exports = router;
