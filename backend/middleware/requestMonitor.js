/**
 * API 请求监控中间件
 * 捕获所有 HTTP 请求/响应并通过 SSE 推送到前端
 */

// SSE 客户端连接集合
const sseClients = new Set();

/**
 * 截断过长的 body
 */
function truncateBody(body, maxLength = 500) {
  if (!body) return null;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (str.length <= maxLength) return body;
  return str.substring(0, maxLength) + `... (${str.length} chars total)`;
}

/**
 * 安全解析 JSON
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * 广播日志到所有 SSE 客户端
 */
function broadcast(logEntry) {
  const message = `data: ${JSON.stringify({ type: 'request', data: logEntry })}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      // 客户端已断开，会在 close 事件中清理
    }
  });
}

/**
 * 请求监控中间件
 * 拦截 res.write / res.end 以捕获响应体
 */
function requestMonitorMiddleware(req, res, next) {
  // 跳过 SSE 端点自身和静态文件
  if (req.path === '/api/monitor/stream' || req.path.startsWith('/public/')) {
    return next();
  }

  const startTime = Date.now();
  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res);
  let responseBody = '';
  let bodyCaptured = false;

  // 拦截 res.write
  res.write = function(chunk, encoding) {
    if (chunk && !bodyCaptured) {
      responseBody += chunk.toString();
      if (responseBody.length > 2000) {
        bodyCaptured = true; // 停止捕获过大的响应
      }
    }
    return originalWrite(chunk, encoding);
  };

  // 拦截 res.end
  res.end = function(chunk, encoding) {
    if (chunk && !bodyCaptured) {
      responseBody += chunk.toString();
    }
    const duration = Date.now() - startTime;

    // 构建日志条目
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: duration,
      requestBody: truncateBody(req.body),
      responseBody: truncateBody(safeJsonParse(responseBody))
    };

    // 广播到所有 SSE 客户端
    broadcast(logEntry);

    // 调用原始 end
    return originalEnd(chunk, encoding);
  };

  next();
}

/**
 * SSE 端点处理函数
 */
function sseHandler(req, res) {
  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // 发送初始连接消息
  res.write(`data: ${JSON.stringify({ type: 'connected', message: '监控已连接' })}\n\n`);

  // 添加到客户端集合
  sseClients.add(res);

  // 客户端断开时清理
  req.on('close', () => {
    sseClients.delete(res);
  });
}

module.exports = {
  requestMonitorMiddleware,
  sseHandler,
  sseClients
};
