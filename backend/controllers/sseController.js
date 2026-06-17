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

module.exports = { stream };
