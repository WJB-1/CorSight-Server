# Phase 1 基础设施与数据库模块

## 模块概述

本模块完成了视障语义地图导航预览 Agent 的基础架构搭建，包括：
- Express 服务器基础框架
- MongoDB 数据库连接与空间索引
- CorSight 空间查询服务
- LLM 配置管理

## 文件结构

```
backend/
├── server.js                 # Express 启动入口
├── .env                      # 环境变量配置
├── package.json              # 依赖管理
├── config/
│   ├── db.js                 # MongoDB 连接模块
│   └── llmConfig.js          # LLM 配置管理器
├── models/
│   └── SamplingPoint.js      # 采样点数据模型 (2dsphere索引)
├── routes/
│   ├── mapRoutes.js          # 空间查询路由
│   └── configRoutes.js       # LLM 配置路由
└── services/
    └── corsightService.js    # CorSight 空间查询服务
```

## 已实现的接口

### 1. 健康检查
```http
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "service": "nav-preview-backend",
  "timestamp": "2026-03-23T14:03:00.073Z"
}
```

### 2. 空间查询 - 获取附近采样点
```http
GET /api/navigation/nearby?lat={纬度}&lon={经度}&radius={半径}
```
**Parameters:**
- `lat` (required): 纬度
- `lon` (required): 经度  
- `radius` (optional): 搜索半径，默认 50 米

**Response:**
```json
{
  "success": true,
  "data": {
    "total_count": 0,
    "points": [
      {
        "point_id": "Point_1678888888_A1B2",
        "location": {
          "latitude": 39.9095,
          "longitude": 116.3976
        },
        "scene_description": "十字路口，有盲道和红绿灯",
        "images": {
          "N": "/public/images/xxx_N.jpg",
          "NE": "...",
          "E": "...",
          "SE": "...",
          "S": "...",
          "SW": "...",
          "W": "...",
          "NW": "..."
        },
        "distance_meters": 25
      }
    ]
  }
}
```

### 3. LLM 配置 - 保存配置
```http
POST /api/config/llm
Content-Type: application/json

{
  "provider": "gemini",
  "api_key": "AIzaSy...",
  "model_name": "gemini-robotics-er-1.5-preview",
  "is_active": true
}
```

### 4. LLM 配置 - 获取当前激活配置
```http
GET /api/config/llm/active
```
**Response:**
```json
{
  "success": true,
  "active_provider": "gemini",
  "active_model": "gemini-robotics-er-1.5-preview",
  "has_active_key": true
}
```

### 5. LLM 配置 - 获取可用模型列表
```http
GET /api/config/llm/models
```

## 与后续模块的兼容性协议

### 1. 数据库层 -> 服务层 (corsightService)
- 通过标准 GeoJSON 格式通信
- 使用 Mongoose 2dsphere 索引的 `$nearSphere` 操作符
- 坐标格式: `[longitude, latitude]`

### 2. 服务层 -> 路由层 (mapRoutes) -> 前端
- 统一使用 JSON 响应体
- 外层包裹 `success` 和 `data` 字段
- 错误响应包含 `error` 字段

### 3. 服务层 (corsightService) -> Agent层 (Phase 3/4)
- 返回的采样点数据将作为 LLM Prompt 的上下文
- 字段命名严格遵循 Schema 定义:
  - `point_id`: 采样点唯一标识
  - `location`: 包含 `latitude` 和 `longitude`
  - `scene_description`: 场景自然语言描述
  - `images`: 8个方位的图片路径 (N, NE, E, SE, S, SW, W, NW)
  - `distance_meters`: 距离查询点的距离（米）

## 启动方式

```bash
cd backend
npm install
node server.js
```

服务器默认运行在 `http://localhost:3002`

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3002 | 服务器端口 |
| MONGODB_URI | mongodb://localhost:27017/nav_preview_db | MongoDB 连接字符串 |
| NODE_ENV | development | 运行环境 |

## 依赖列表

- express: ^4.18.2 - Web 框架
- mongoose: ^8.0.0 - MongoDB ODM
- cors: ^2.8.5 - 跨域处理
- dotenv: ^16.3.1 - 环境变量
- multer: ^1.4.5-lts.1 - 文件上传

## 测试

```bash
# 运行功能测试
node test/test-server.js

# 运行诊断工具
node test/debug.js
```

## Phase 2+ 模块开发指南

### 扩展数据库模型
如需添加新字段到 SamplingPoint，修改 `models/SamplingPoint.js`：

```javascript
const samplingPointSchema = new mongoose.Schema({
  // ... 现有字段
  
  // 新字段示例
  new_field: {
    type: String,
    default: ''
  }
});
```

### 添加新路由
在 `routes/` 目录创建新路由文件，并在 `server.js` 中挂载：

```javascript
// server.js
const newRoutes = require('./routes/newRoutes');
app.use('/api/new', newRoutes);
```

### 调用 CorSight 服务
```javascript
const corsightService = require('./services/corsightService');

// 获取附近采样点
const points = await corsightService.getNearbyPoints(lat, lon, radius);

// 根据 ID 获取采样点
const point = await corsightService.getPointById(pointId);
```

### 使用 LLM 配置
```javascript
const llmConfig = require('./config/llmConfig');

// 获取当前激活的 API Key
const apiKey = llmConfig.getActiveKey();

// 获取当前配置
const config = llmConfig.getActiveConfig();
```

## 注意事项

1. **MongoDB 依赖**: 需要本地或远程 MongoDB 服务运行
2. **内存存储**: LLM API Key 仅存储在内存中，服务器重启后需重新配置
3. **坐标顺序**: GeoJSON 格式使用 `[longitude, latitude]`，但对外接口统一使用 `latitude` 和 `longitude` 参数