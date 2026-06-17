/**
 * 日志中间件
 *
 * 职责：
 * 1. Express 中间件：记录 HTTP 请求/响应日志，通过 SSE 推送
 * 2. 提供 logger.info/warn/error 方法，主动输出日志并通过 SSE 推送
 * 3. 提供 logSSE 端点给前端 EventSource 连接
 *
 * 不再劫持全局 console.* — 业务代码通过 require logger 主动调用。
 */

const logClients = new Set();

// ── 1. 显式日志方法 ─────────────────────────────

function broadcastLog(level, message) {
  const entry = JSON.stringify({
    type: 'log',
    level,
    message,
    timestamp: new Date().toISOString(),
  });

  for (const client of logClients) {
    try {
      client.write(`data: ${entry}\n\n`);
    } catch (_) {
      logClients.delete(client);
    }
  }
}

const logger = {
  info(...args) {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.log(msg);
    broadcastLog('info', msg);
  },
  warn(...args) {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.warn(msg);
    broadcastLog('warn', msg);
  },
  error(...args) {
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.error(msg);
    broadcastLog('error', msg);
  },
};

// ── 2. Express 请求日志中间件 ─────────────────────

function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  // 跳过日志流和瓦片请求
  if (url.startsWith('/api/logs/') || url.includes('/tiles/')) {
    return next();
  }

  res.on('finish', () => {
    const entry = JSON.stringify({
      type: 'request',
      method,
      url,
      status: res.statusCode,
      duration: Date.now() - start,
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
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', message: '日志流已连接' })}\n\n`);
  logClients.add(res);
  console.log(`[Logger] SSE client connected (total: ${logClients.size})`);

  req.on('close', () => {
    logClients.delete(res);
    console.log(`[Logger] SSE client disconnected (total: ${logClients.size})`);
  });
}

module.exports = { logger, requestLogger, logStreamHandler };
