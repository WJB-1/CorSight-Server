# CorSight Server — 项目提示词

## 项目定位

视障语义地图与智能导航后端服务。面向视障人士，提供街景采集、路径规划、行前预览语音播报、实时导航指引。

## 仓库信息

| 项 | 值 |
|---|---|
| **GitHub 仓库** | https://github.com/WJB-1/CorSight-Server.git |
| **部署分支** | `deploy/server`（唯一维护分支） |
| **本地工作目录** | `D:\project_file\CorSight_Navigation\CorSight_v1.0\CorSight-Server_release` |
| **服务器目录** | `E:\Cross-domain_authentication_verification\HeartSight` |
| **服务器 IP** | 172.23.206.119（内网） |
| **服务器用户** | supor2 |
| **服务器端口** | 5741 |

## 维护规则

1. **只维护 `CorSight-Server_release` 目录**，不在 v2.0 目录改代码
2. **只维护 `deploy/server` 分支**，不推 main 或 v2-dev
3. **改完本地后需要同步到服务器验证通过才算过关**
4. 服务器上手动重启：`schtasks /end /tn HeartSight & schtasks /run /tn HeartSight`

## 远程开发流程

```
本地改代码 → 本地验证 → 同步到 release → scp 上传服务器 → 服务器重启 → 验证 API → 提交 git
```

### SSH 连接服务器

```
ssh -i /c/Users/魏家冰/.ssh/id_ed25519 -o StrictHostKeyChecking=no supor2@172.23.206.119 'cmd.exe /c "命令"'
```

### 上传文件到服务器

```
scp -i /c/Users/魏家冰/.ssh/id_ed25519 -o StrictHostKeyChecking=no 本地路径 supor2@172.23.206.119:"远程路径"
```

### 服务器部署结构

```
E:\Cross-domain_authentication_verification\HeartSight\
├── backend\           ← 后端代码（server.js 入口）
│   ├── node_modules\
│   ├── .env           ← 服务器环境变量（不同本地）
│   └── ...
├── frontend\dist\     ← 前端编译产物（从本地 build 后 scp 上传）
├── shared\images\     ← 街景图片（718 张，v1/v2 共享）
├── osm_data\          ← 地图数据（guangzhou.osm, guangzhou_full.mbtiles）
├── graphhopper\       ← 路线引擎（graphhopper-web-10.0.jar + config.yml）
├── tools\             ← 工具（osmium.exe, jdk-17）
└── start_heartsight.bat  ← 启动脚本（MongoDB + Node.js）
```

### 服务器环境

| 依赖 | 路径 |
|------|------|
| Node.js v22 | `E:\...\Node.js\` |
| JDK 17 | `C:\Users\Supor2\jdk-17\` |
| Python 3.12 | `E:\anaconda3\python.exe` |
| MongoDB 6.0 | `C:\Users\Supor2\mongodb-win32-...\bin\mongod.exe`（端口 27017） |
| osmium 1.19 | `E:\...\HeartSight\tools\osmium.exe` |

## 架构分层（严格单向）

```
routes → controllers → services → models
                   ↘ lib/（纯函数，无副作用）
```

- ❌ routes 不能直接调 service 或 model
- ❌ controller 不能直接查 model
- ❌ lib/ 不能引用 service 或 model
- ❌ service 不能反向调 controller

## 后端技术栈

- Node.js 22 + Express 4 + MongoDB 8 + Mongoose
- 阿里云百炼 qwen-vl-plus（VLM）+ qwen-plus（文本）
- 高德步行 API + GraphHopper 10.0（双引擎）
- OpenMapTiles 矢量瓦片（planetiler 生成）
- SSE 实时推送（路线进度 + 日志流）

## 前端技术栈

- Vite 5 + 原生 JavaScript（无框架）
- MapLibre GL JS 4.7（矢量地图）
- 暗色/浅色主题可切换

## 关键文件

| 文件 | 作用 |
|------|------|
| `backend/server.js` | 入口，路由挂载，SPA fallback |
| `backend/config/envConfig.js` | 环境变量（默认值用相对路径，.env 可覆盖） |
| `backend/ARCHITECTURE/api_contract.md` | API 接口文档（21 个端点） |
| `backend/ARCHITECTURE/bugfix_report.md` | 排错报告（持续更新） |
| `backend/ARCHITECTURE/coupling_report.md` | 耦合度审计 |
| `backend/ARCHITECTURE/deployment_deps.md` | 部署依赖清单 |
| `frontend/src/map.js` | 地图初始化 + 瓦片渲染 |
| `frontend/src/roadInteraction.js` | 道路交互（悬停高亮 + 点击查询） |
| `frontend/src/routePlanner.js` | 路线规划 + SSE 进度 |
| `frontend/src/main.js` | 前端入口 |

## 已知限制

- 服务器无管理员权限，MongoDB/Node 需手动启动或计划任务
- 校园内网 IP，校外需穿透
- CPU 仅 1 核 2 线程，GraphHopper 首次建索引较慢
- osmium 未注册 PATH，脚本中用绝对路径调用
