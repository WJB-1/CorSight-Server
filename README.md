# CorSight Server

视障语义地图与智能导航统一后端服务。

## 项目结构

```
CorSight-Server/
├── backend/              # 统一后端服务 (Node.js + Express)
│   ├── agents/           # AI Agent：感知Agent、语言优化Agent、主Agent
│   ├── config/           # 配置管理 (数据库、LLM、环境变量)
│   ├── controllers/      # 控制器
│   ├── middleware/       # 中间件
│   ├── models/           # MongoDB 数据模型
│   ├── prompts/          # LLM 提示词模板
│   ├── routes/           # API 路由
│   ├── services/         # 业务服务 (高德地图、LLM客户端、空间查询)
│   ├── public/           # 静态文件 (街景图片)
│   └── server.js         # 统一服务入口 (端口 3002)
│
├── frontend/             # 前端 (Vite)
│
├── scripts/              # 启动/停止脚本
│   ├── start-backend.bat # 启动统一后端
│   ├── start-frontend.bat# 启动前端
│   └── stop-all.bat      # 停止所有服务
│
├── data_pipeline/        # 数据导入与处理脚本
├── doc/                  # 项目文档
├── project/              # 开发指南与参考脚本
└── test/                 # 测试脚本
```

## 环境要求

- Node.js >= 18
- MongoDB >= 5.0
- npm 或 pnpm

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env`：

```env
# 高德地图 Web 服务 API Key
AMAP_WEB_KEY=your_amap_web_key_here

# LLM API Keys (至少配置一个)
GEMINI_API_KEY=your_gemini_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
BAILIAN_API_KEY=your_bailian_api_key_here

# MongoDB
MONGODB_URI=mongodb://localhost:27017/blind_map

# 代理配置 (如需)
HTTPS_PROXY=http://127.0.0.1:7897
```

### 3. 启动 MongoDB

确保本地 MongoDB 已运行。

### 4. 启动服务

```bash
# 一键启动 (Windows)
start.bat

# 或手动启动
cd backend
node server.js    # 统一服务 (端口 3002)

cd ../frontend
npm run dev       # 前端 (端口 5173)
```

## API 说明

| 服务 | 地址 | 端口 | 说明 |
|------|------|------|------|
| Unified Backend | http://localhost:3002 | 3002 | 导航预览 + 地图数据 + 采样点管理 |
| Frontend Dev | http://localhost:5173 | 5173 | 开发环境前端 |

### 导航预览 API
- `POST /api/navigation/preview` — 行前路线预览
- `GET /api/navigation/preview/test` — 测试完整流程
- `GET /api/navigation/preview/health` — 健康检查

### 地图数据 API
- `GET /api/navigation/nearby?lat={lat}&lon={lon}&radius={radius}` — 附近采样点
- `POST /api/upload/sampling_point` — 上传采样点（图片 + JSON）
- `GET /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}` — OSM 地图数据

### 配置 API
- `GET /api/config/llm/active` — 当前 LLM 配置
- `GET /api/config/llm/models` — 可用模型列表

## 安全提醒

- `.env` 文件已加入 `.gitignore`，**切勿提交到 Git**
- 定期轮换 API Key
- 生产环境使用 HTTPS 并配置防火墙
