/**
 * 日志中间件 + console 拦截
 *
 * 职责：
 * 1. 拦截所有 console.log/warn/error，通过 SSE 广播给前端
 * 2. Express 中间件：拦截所有 HTTP 请求/响应，记录状态码和耗时
 * 3. 提供 logSSE 端点给前端 EventSource 连接
 *
 * 前端只需连接 GET /api/logs/stream 即可收到后端所有日志。
 */

const logClients = new Set(); // 所有日志 SSE 连接的 res 对象

// ── 1. 拦截 console.* ─────────────────────────────

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

function broadcastLog(level, args) {
  const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');

  // 推送给所有日志 SSE 客户端
  const entry = JSON.stringify({
    type: 'log',
    level,
    message,
    timestamp: new Date().toISOString(),
  });

  for (const res of logClients) {
    try {
      res.write(`data: ${entry}\n\n`);
    } catch (_) {
      logClients.delete(res);
    }
  }
}

// 替换 console 方法
console.log = (...args) => {
  originalConsole.log(...args);
  broadcastLog('info', args);
};

console.warn = (...args) => {
  originalConsole.warn(...args);
  broadcastLog('warn', args);
};

console.error = (...args) => {
  originalConsole.error(...args);
  broadcastLog('error', args);
};

console.info = (...args) => {
  originalConsole.info(...args);
  broadcastLog('info', args);
};

// ── 2. Express 请求日志中间件 ─────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // 跳过日志流和瓦片请求（太频繁，会刷屏）
  if (url.startsWith('/api/logs/') || url.includes('/tiles/')) {
    return next();
  }

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    const entry = JSON.stringify({
      type: 'request',
      method,
      url,
      status,
      duration,
      timestamp: new Date().toISOString(),
    });

    for (const client of logClients) {
      try {
        client.write(`data: ${entry}\n\n`);
      } catch (_) {
        logClients.delete(client);
      }
    }
  });

  next();
}

// ── 3. SSE 端点处理器 ─────────────────────────────

function logStreamHandler(req, res) {
  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 连接确认
  res.write(`data: ${JSON.stringify({ type: 'connected', message: '日志流已连接' })}\n\n`);

  // 加入客户端列表
  logClients.add(res);
  originalConsole.log(`[Logger] Log SSE client connected (total: ${logClients.size})`);

  // 客户端断开时清理
  req.on('close', () => {
    logClients.delete(res);
    originalConsole.log(`[Logger] Log SSE client disconnected (total: ${logClients.size})`);
  });
}

module.exports = {
  requestLogger,
  logStreamHandler,
  logClients,
};
