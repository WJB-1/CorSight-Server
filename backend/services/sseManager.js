/**
 * SSE 连接管理器（单例）
 *
 * 管理所有活跃的 SSE 连接，提供按 requestId 推送的能力。
 *
 * 用法：
 *   const sse = require('./sseManager');
 *
 *   // 后端处理过程中推进度
 *   sse.push(requestId, { step: 'route', message: '路线规划完成' });
 *   sse.push(requestId, { step: 'rag', message: '路况检索完成' });
 *   sse.push(requestId, { step: 'done', message: '播报生成完毕', data: {...} });
 *
 *   // 推完后关闭连接
 *   sse.close(requestId);
 */

const clients = new Map(); // requestId → { res, createdAt }

/**
 * 注册一个 SSE 连接
 * @param {string} requestId
 * @param {object} res — Express response 对象
 */
function register(requestId, res) {
  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁止 nginx 缓冲
  });

  // 发送初始连接确认
  res.write(`data: ${JSON.stringify({ event: 'connected', requestId })}\n\n`);

  clients.set(requestId, { res, createdAt: Date.now() });

  // 客户端断开时清理
  res.on('close', () => {
    clients.delete(requestId);
  });
}

/**
 * 向指定 requestId 推送消息
 * @param {string} requestId
 * @param {object} data — 要推送的数据
 * @returns {boolean} 是否推送成功
 */
function push(requestId, data) {
  const client = clients.get(requestId);
  if (!client) return false;

  try {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (err) {
    console.warn(`[SSE] Push failed for ${requestId}:`, err.message);
    clients.delete(requestId);
    return false;
  }
}

/**
 * 关闭指定 SSE 连接
 * @param {string} requestId
 */
function close(requestId) {
  const client = clients.get(requestId);
  if (!client) return;

  try {
    client.res.write(`data: ${JSON.stringify({ event: 'close' })}\n\n`);
    client.res.end();
  } catch (_) {}
  clients.delete(requestId);
}

/**
 * 获取当前活跃连接数
 * @returns {number}
 */
function getCount() {
  return clients.size;
}

/**
 * 清理超时连接（可选，定期调用）
 * @param {number} [timeoutMs=600000] — 超时时间（默认 10 分钟）
 */
function cleanup(timeoutMs = 600000) {
  const now = Date.now();
  for (const [requestId, client] of clients) {
    if (now - client.createdAt > timeoutMs) {
      console.log(`[SSE] Cleaning up stale connection: ${requestId}`);
      close(requestId);
    }
  }
}

module.exports = { register, push, close, getCount, cleanup };
