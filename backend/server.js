/**
 * CorSight Unified Server — v2.0 骨架入口
 *
 * 分层约定（依赖方向严格单向）：
 *   routes → controllers → services → models
 *                     ↘ agents  → services → models
 *                          ↘ lib/（纯工具函数，无副作用）
 *
 * middleware/ 只放真正的 Express 中间件 (req, res, next)
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// ── 1. 环境变量（最早加载） ───────────────────────
dotenv.config({ override: false, silent: true });

const config = require('./config/envConfig');
const { connectDB } = require('./config/db');

const app = express();
const PORT = config.server.PORT;

// ── 2. 全局中间件 ─────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 日志中间件（拦截 HTTP 请求，通过 SSE 推送）
const { requestLogger } = require('./middleware/logger');
app.use(requestLogger);

// 上传图片 + 共享街景图片
const sharedImagesPath = path.resolve(__dirname, '..', 'shared', 'images');
console.log(`[Server] Shared images: ${sharedImagesPath} (exists: ${require('fs').existsSync(sharedImagesPath)})`);
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: true }));
app.use('/images', express.static(sharedImagesPath, { fallthrough: true }));

// 前端静态文件（dist 目录）— 预读 index.html 到内存
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
const indexPath = path.join(distPath, 'index.html');
let indexHtml = null;
if (require('fs').existsSync(indexPath)) {
  indexHtml = require('fs').readFileSync(indexPath, 'utf-8');
  console.log(`[Server] Frontend index.html loaded (${(indexHtml.length / 1024).toFixed(1)}KB)`);
} else {
  console.warn(`[Server] Frontend not found: ${indexPath}`);
}

// ── 3. 路由挂载 ───────────────────────────────────
const uploadRoutes = require('./routes/uploadRoutes');
const dataRoutes = require('./routes/dataRoutes');
const batchRoutes = require('./routes/batchRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const sseRoutes = require('./routes/sseRoutes');
const tileRoutes = require('./routes/tileRoutes');
const logRoutes = require('./routes/logRoutes');
const roadRoutes = require('./routes/roadRoutes');
const guideRoutes = require('./routes/guideRoutes');

app.use('/api/upload', uploadRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/tiles', tileRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/road', roadRoutes);
app.use('/api/guide', guideRoutes);

// ── 4. 健康检查 ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'corsight-server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── 5. SPA fallback + 404 ─────────────────────────
app.get('*', (req, res, next) => {
  // API 和 health 请求跳过
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  // 检查是否对应 dist 下的实际静态文件（.js, .css 等）
  if (indexHtml) {
    const filePath = path.join(distPath, req.path);
    if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
    // 否则返回预加载的 index.html
    res.setHeader('Content-Type', 'text/html');
    return res.send(indexHtml);
  }
  next();
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: '请求的资源不存在' });
});

app.use((err, req, res, _next) => {
  console.error('[App] Global error:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: config.server.isDevelopment ? err.message : undefined,
  });
});

// ── 6. 启动 ───────────────────────────────────────
async function startServer() {
  try {
    // 验证配置
    const warnings = config.validate();
    if (warnings.length > 0 && config.server.isDevelopment) {
      warnings.forEach((w) => console.warn(w));
    }

    // 连接数据库
    await connectDB();

    // 确保上传目录存在
    const imageStorageService = require('./services/imageStorageService');
    imageStorageService.ensureUploadDir();

    // 启动 HTTP 服务
    const server = app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log(`[Server] CorSight v2.0 started`);
      console.log(`[Server] Port: ${PORT}`);
      console.log(`[Server] Env: ${config.server.NODE_ENV}`);
      console.log(`[Server] Health: http://localhost:${PORT}/health`);
      console.log('='.repeat(50));
    });

    // 优雅关闭
    const shutdown = (signal) => {
      console.log(`[Server] ${signal} received, shutting down`);
      server.close(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app };
