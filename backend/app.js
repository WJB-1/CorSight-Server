/**
 * 视障语义地图后端服务 - 模块五
 * 主应用入口文件
 * 
 * 技术栈：Node.js + Express + MongoDB (Mongoose)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDatabase } = require('./config/database');

// 导入路由
const uploadRoutes = require('./routes/upload');
const navigationRoutes = require('./routes/navigation');
const mapRoutes = require('./routes/map');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3001;

// 中间件配置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 为静态文件添加 CORS 头的中间件
app.use((req, res, next) => {
  // 为所有响应添加 CORS 头
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 静态文件服务 - 用于访问上传的图片
// public 目录下的文件直接通过根路径访问 (如 /images/P001_N.jpg)
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'blind-map-backend',
    version: '1.0.0'
  });
});

// API 路由
app.use('/api/upload', uploadRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/map', mapRoutes);

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: '视障语义地图后端服务 - 模块五',
    version: '1.0.0',
    endpoints: {
      upload: {
        method: 'POST',
        path: '/api/upload/sampling_point',
        description: '上传采样点数据（图片 + JSON）'
      },
      navigation: {
        method: 'GET',
        path: '/api/navigation/nearby?lat={lat}&lon={lon}&radius={radius}',
        description: '查找附近的采样点'
      },
      map: {
        method: 'GET',
        path: '/api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}',
        description: '获取 OSM 行人地图数据'
      },
      health: {
        method: 'GET',
        path: '/health',
        description: '服务健康检查'
      }
    }
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '请求的资源不存在'
  });
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('[App] 全局错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
async function startServer() {
  try {
    // 1. 连接数据库
    await connectDatabase();
    
    // 2. 启动 HTTP 服务
    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log(`[Server] 视障语义地图后端服务已启动`);
      console.log(`[Server] 监听端口: ${PORT}`);
      console.log(`[Server] 环境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] API 文档: http://localhost:${PORT}/`);
      console.log('='.repeat(50));
    });
    
  } catch (error) {
    console.error('[Server] 启动失败:', error.message);
    process.exit(1);
  }
}

// 启动应用
startServer();

module.exports = app;
