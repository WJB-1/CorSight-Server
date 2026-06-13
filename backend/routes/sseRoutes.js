/**
 * SSE 路由
 *
 * GET /api/sse/stream?requestId=xxx
 *
 * 前端打开这个连接后，后端通过 sseManager.push(requestId, data) 推送消息。
 * 客户端断开时自动清理。
 */

const express = require('express');
const sseManager = require('../services/sseManager');

const router = express.Router();

router.get('/stream', (req, res) => {
  const requestId = req.query.requestId;

  if (!requestId) {
    return res.status(400).json({ success: false, message: 'requestId 参数必填' });
  }

  sseManager.register(requestId, res);

  console.log(`[SSE] Client connected: ${requestId} (active: ${sseManager.getCount()})`);
});

module.exports = router;
