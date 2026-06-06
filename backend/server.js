const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// ============================================
// 第一步：最早阶段初始化环境变量
// ============================================
dotenv.config({ override: false, silent: true });

// 加载统一配置（必须在 dotenv.config 之后）
const config = require('./config/envConfig');
const { connectDB } = require('./config/db');
const { connectDatabase } = require('./config/database');
const { requestMonitorMiddleware, sseHandler } = require('./middleware/requestMonitor');

const app = express();
const PORT = config.server.PORT;

// ============================================
// Express 中间件
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestMonitorMiddleware);

// 静态文件服务 - 用于访问上传的图片
app.use(express.static(path.join(__dirname, 'public')));

// SSE 监控端点
app.get('/api/monitor/stream', sseHandler);

// ============================================
// 导入路由
// ============================================

// 导航预览路由 (server.js 原有)
const mapRoutes = require('./routes/mapRoutes');
const configRoutes = require('./routes/configRoutes');
const navigationRoutes = require('./routes/navigationRoutes');

// 地图数据路由 (app.js 原有)
const uploadRoutes = require('./routes/upload');
const blindMapNavigationRoutes = require('./routes/navigation');
const mapChunkRoutes = require('./routes/map');

// ============================================
// 挂载路由
// ============================================

// 导航预览 API (端口 3002 原有)
app.use('/api/navigation', mapRoutes);
app.use('/api/config/llm', configRoutes);
app.use('/api/navigation', navigationRoutes);

// 地图数据 API (端口 3001 原有，现在合并到 3002)
app.use('/api/upload', uploadRoutes);
app.use('/api/navigation', blindMapNavigationRoutes);
app.use('/api/map', mapChunkRoutes);

// ============================================
// 健康检查与根路由
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'corsight-unified-server',
    timestamp: new Date().toISOString(),
    apis: {
      preview: '/api/navigation/preview',
      nearby: '/api/navigation/nearby',
      upload: '/api/upload/sampling_point',
      map_chunk: '/api/map/chunk',
      config: '/api/config/llm'
    }
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'CorSight Unified Server',
    version: '2.0.0',
    description: '视障语义地图与智能导航统一服务',
    endpoints: {
      navigation: {
        preview: 'POST /api/navigation/preview',
        nearby: 'GET /api/navigation/nearby?lat={lat}&lon={lon}&radius={radius}',
        test: 'GET /api/navigation/preview/test',
        health: 'GET /api/navigation/preview/health'
      },
      map: {
        upload: 'POST /api/upload/sampling_point',
        chunk: 'GET /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}'
      },
      config: {
        active: 'GET /api/config/llm/active',
        models: 'GET /api/config/llm/models',
        probe: 'GET /api/config/llm/probe'
      }
    }
  });
});

// ============================================
// 错误处理
// ============================================

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: '请求的资源不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[App] Global error:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// 启动服务器
// ============================================

async function startServer() {
  try {
    // 验证配置
    const warnings = config.validate();
    if (warnings.length > 0 && config.server.isDevelopment) {
      warnings.forEach(w => console.warn(w));
    }

    // 连接数据库（两个连接模块都尝试，兼容旧代码）
    try {
      await connectDB();
    } catch (e) {
      console.warn('[Server] connectDB failed, trying connectDatabase:', e.message);
      await connectDatabase();
    }

    // 启动 HTTP 服务
    const server = app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log(`[Server] CorSight Unified Server started`);
      console.log(`[Server] Port: ${PORT}`);
      console.log(`[Server] Env: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Health: http://localhost:${PORT}/health`);
      console.log(`[Server] Preview API: http://localhost:${PORT}/api/navigation/preview`);
      console.log(`[Server] Nearby API: http://localhost:${PORT}/api/navigation/nearby`);
      console.log(`[Server] Upload API: http://localhost:${PORT}/api/upload/sampling_point`);
      console.log('='.repeat(50));
    });

    // 优雅关闭
    process.on('SIGTERM', () => {
      console.log('[Server] SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app };
