/**
 * SSE 连接控制器
 */

const sseManager = require('../services/sseManager');

function stream(req, res) {
  const requestId = req.query.requestId;
  if (!requestId) {
    return res.status(400).json({ success: false, message: 'requestId 参数必填' });
  }
  sseManager.register(requestId, res);
  console.log(`[SSE] Client connected: ${requestId} (active: ${sseManager.getCount()})`);
}

/**
 * 全局事件流 — 监听所有广播事件（上传进度、VLM 进度等）
 * GET /api/sse/events
 */
function events(req, res) {
  sseManager.registerGlobal(res);
  console.log(`[SSE] Global client connected`);
}

module.exports = { stream, events };
