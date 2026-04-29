# CorSight Server

视障语义地图与智能导航后端服务。

## 项目结构

```
CorSight-Server/
├── backend/              # navigation_agent 后端 (Node.js)
│   ├── agents/           # AI Agent：感知Agent、语言优化Agent
│   ├── config/           # 配置管理 (数据库、LLM、环境变量)
│   ├── controllers/      # 控制器
│   ├── middleware/       # 中间件
│   ├── models/           # MongoDB 数据模型
│   ├── prompts/          # LLM 提示词模板
│   ├── routes/           # API 路由
│   ├── services/         # 业务服务 (高德地图、LLM客户端)
│   └── server.js         # 服务入口
│
├── data_pipeline/        # 数据导入与处理脚本
├── doc/                  # 项目文档
├── frontend/             # navigation_agent 前端 (Vite)
├── project/              # 开发指南与参考脚本
├── test/                 # 测试脚本
├── start-all.bat         # Windows 一键启动
├── start-all.ps1         # PowerShell 一键启动
└── stop-all.bat          # Windows 停止服务
```

## 环境要求

- Node.js >= 18
- MongoDB >= 5.0
- npm 或 pnpm

## 快速开始

### 1. 安装依赖

```bash
# 后端服务
cd backend
npm install

# 前端 (可选)
cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env`，填入你的 API Key：

```env
# 高德地图 Web 服务 API Key
# 获取地址：https://lbs.amap.com/api/webservice/gettingstarted
AMAP_WEB_KEY=your_amap_web_key_here

# Google Gemini API Key
# 获取地址：https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# DeepSeek API Key
# 获取地址：https://platform.deepseek.com/
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 阿里云百炼 API Key
# 获取地址：https://bailian.console.aliyun.com/
BAILIAN_API_KEY=your_bailian_api_key_here

# MongoDB
MONGODB_URI=mongodb://localhost:27017/blind_map

# 代理配置 (如需)
HTTPS_PROXY=http://127.0.0.1:7897
HTTP_PROXY=http://127.0.0.1:7897
```

### 3. 启动 MongoDB

确保本地 MongoDB 已运行，或修改 `.env` 中的 `MONGODB_URI` 指向远程数据库。

### 4. 启动服务

```bash
# 方式一：一键启动 (Windows)
start-all.bat

# 方式二：手动启动
cd backend
node server.js          # navigation_agent 服务 (默认端口 3002)
```

Blind_map 后端如需单独启动：

```bash
cd ../Blind_map/backend  # 如存在
node app.js              # 端口 3000
```

### 5. 访问前端 (可选)

```bash
cd frontend
npm run dev              # 默认端口 5173
```

## API 说明

| 服务 | 地址 | 端口 | 说明 |
|------|------|------|------|
| Blind_map API | http://localhost:3000 | 3000 | 语义地图数据服务 |
| Navigation Agent API | http://localhost:3002 | 3002 | 智能导航与行前预览 |
| Frontend Dev | http://localhost:5173 | 5173 | 开发环境前端 |

主要接口：
- `POST /api/trip/preview` — 行前路线预览
- `GET /api/map/points` — 获取采样点数据
- `POST /api/navigation/route` — 步行路径规划

详见 `doc/` 目录下的接口契约文档。

## 安全提醒

- `.env` 文件已加入 `.gitignore`，**切勿提交到 Git**
- 定期轮换 API Key
- 生产环境使用 HTTPS 并配置防火墙

## 相关仓库

- [CorSight-Android](https://github.com/你的用户名/CorSight-Android) — Android 语音导航客户端
