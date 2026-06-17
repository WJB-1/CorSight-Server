# CorSight Server — 视障语义地图与智能导航后端

> 面向视障人士的语义地图采集、路径规划与行前预览系统。
> 基于 Node.js + Express + MongoDB，部署于校园内网服务器。

---

## 一、项目概况

| 项 | 说明 |
|---|------|
| **定位** | 视障导航数据采集 + 路线规划 + 行前预览语音播报 |
| **技术栈** | Node.js 22 + Express 4 + MongoDB 8 + MapLibre GL |
| **AI 引擎** | 阿里云百炼 qwen-vl-plus（VLM）+ qwen-plus（文本） |
| **路线引擎** | 高德步行 API + GraphHopper 10.0（双引擎可切换） |
| **地图数据** | OpenMapTiles + planetiler 矢量瓦片 + osm_ways 空间查询 |
| **部署端口** | 5741 |

---

## 二、架构分层（严格单向依赖）

```
routes → controllers → services → models
                   ↘ agents   → services → models
                        ↘ lib/  （纯函数，无副作用）
                        ↘ config/ （只读配置）
                        ↘ scripts/（Python 脚本，子进程调用）
```

### 依赖方向规则
- ✅ routes → controllers → services → models
- ✅ services → lib/、config/、prompts/
- ❌ routes 直接调 service 或 model
- ❌ controller 直接查 model
- ❌ service 反向调 controller
- ❌ lib/ 引用 service 或 model

---

## 三、目录结构

```
backend/
├── server.js                 # 入口：express 初始化 + 路由挂载 + 优雅关闭
│
├── config/
│   ├── envConfig.js          # 环境变量（统一读取，.env 可覆盖）
│   ├── db.js                 # MongoDB 连接（唯一，throw 不 exit）
│   └── uploadConfig.js       # 上传限制/路径/TTL
│
├── lib/                      # 纯函数（无副作用，可单元测试）
│   ├── geo.js                # Haversine、Bearing、扇区计算
│   ├── polyline.js           # 路线采样 + 拐点必采
│   ├── coordTransform.js     # GCJ-02 ↔ WGS-84 ↔ BD-09
│   ├── vlmParser.js          # VLM 响应 JSON 提取 + 图片 base64
│   ├── llmClient.js          # 统一 DashScope 客户端工厂
│   ├── processManager.js     # killByPort、waitForHealth
│   ├── routeContextMatcher.js# 路线步骤匹配
│   └── idGenerator.js        # session/batch/point ID
│
├── models/
│   ├── SemanticTag.js        # 永久语义标签（VLM 结果 + OSM 匹配）
│   ├── UploadSession.js      # 临时上传 session（TTL 24h）
│   ├── BatchTask.js          # 批量任务生命周期
│   ├── OsmWorkState.js       # GraphHopper 乒乓切换状态
│   └── RoadTag.js            # 道路增强标签（用户手动编辑）
│
├── middleware/
│   └── logger.js             # 请求日志 + 显式 logger 方法 + SSE 推送
│
├── prompts/
│   ├── promptLoader.js       # 模板加载 + {{variable}} 插值
│   ├── broadcastPrompt.js    # 播报提示词 + fallback
│   └── templates/            # 6 个场景提示词模板
│       ├── perception-steps.md
│       ├── perception-crossing.md
│       ├── perception-overpass.md
│       ├── perception-path.md
│       ├── perception-subway.md
│       └── perception-generic.md
│
├── routes/                   # 只做 HTTP 解析 + 参数校验 + 调 controller
│   ├── uploadRoutes.js       # POST /metadata, POST /image, GET /session/:id
│   ├── navigationRoutes.js   # GET /points, POST /route
│   ├── dataRoutes.js         # GET /tags/pending, /stats, POST /inject, /gh/*
│   ├── batchRoutes.js        # GET /pending, /stats, POST /trigger, GET /:id
│   ├── roadRoutes.js         # GET /at, /geojson, /:osmId, POST/DELETE /:osmId
│   ├── guideRoutes.js        # POST /session, /frame, /stop, GET /status
│   ├── sseRoutes.js          # GET /stream（路线进度 SSE）
│   ├── logRoutes.js          # GET /stream（日志流 SSE）
│   └── tileRoutes.js         # GET /{z}/{x}/{y}.pbf, /tilejson
│
├── controllers/              # 编排业务流程（调 service，不查 model）
│   ├── metadataController.js
│   ├── imageUploadController.js
│   ├── navigationController.js
│   ├── dataController.js
│   ├── batchController.js
│   ├── roadController.js
│   └── sseController.js
│
├── services/                 # 无状态业务能力
│   ├── uploadSessionService.js       # session CRUD
│   ├── imageStorageService.js        # 图片 buffer→磁盘
│   ├── semanticTagService.js         # SemanticTag 查询封装
│   ├── workspaceService.js           # OsmWorkState 查询封装
│   ├── batchQueryService.js          # BatchTask 查询封装
│   ├── batchProcessorService.js      # 批量处理编排
│   ├── sceneClassificationRunner.js  # 逐图场景分类
│   ├── vlmTaskBuilder.js             # VLM 任务构建 + 结果回写
│   ├── vlmBatchClient.js             # 阿里云 Batch API 管线
│   ├── vlmService.js                 # VLM 服务封装
│   ├── tagMergeService.js            # 多图标签融合
│   ├── vlmTagRetriever.js            # VLM 标签 $near 查询
│   ├── osmWayRetriever.js            # osm_ways 批量查询
│   ├── ragRetrievalService.js        # 三层 RAG 检索编排
│   ├── broadcastService.js           # LLM 播报生成
│   ├── routeService.js               # 路线引擎统一入口
│   ├── amapService.js                # 高德步行 API
│   ├── graphhopperRouteService.js    # GraphHopper 路线 API
│   ├── roadTagService.js             # 道路标签 CRUD + 查询
│   ├── viewSectorService.js          # 视野扇区计算
│   ├── sceneClassifier.js            # 场景分类规则
│   ├── osmPatchService.js            # OSC 生成 + osmium apply
│   ├── graphHopperService.js         # 引擎管理（策略模式 A/B）
│   ├── injectionService.js           # 注入流程编排
│   ├── realtimeGuideService.js       # 实时导航指引（v2.1 新增）
│   └── sseManager.js                 # SSE 连接管理
│
├── scripts/                  # Python 脚本（子进程调用）
│   ├── generate_osc.py       # OSM 补丁生成
│   ├── osm_lookup.py         # OSM 空间查询
│   ├── import_osm_ways.py    # osm_ways 导入 MongoDB
│   └── gcj02_to_wgs84.py     # 坐标系批量转换
│
└── ARCHITECTURE/             # 架构文档
    ├── api_contract.md       # API 接口文档（17 个端点）
    ├── deployment_deps.md    # 部署依赖清单
    ├── bugfix_report.md      # 排错报告（持续更新）
    ├── coupling_report.md    # 耦合度审计报告
    └── refactor_report.md    # 重构结项报告
```

---

## 四、核心数据流

### 4.1 街景采集（两步上传）
```
安卓端 → POST /api/upload/metadata (point_id, location, images[])
       → 返回 session_id
       → POST /api/upload/image ×N (session_id, bearing, fov, file)
       → 全部到齐 → 触发 batchProcessorService
       → 场景分类 → VLM 批量推理 → 标签合并 → SemanticTag
```

### 4.2 路线规划 + 行前预览
```
前端 → POST /api/navigation/route (origin, destination, engine, enable_preview)
     → routeService.getRoute()（高德或 GraphHopper）
     → ragRetrievalService（三层并行查询）：
         ├── VLM 富标签：semantic_tags $near + bearing 筛选
         ├── OSM 原始标签：osm_ways $near
         └── 高德路线语义：steps 匹配
     → broadcastService → LLM 生成三段式播报
     → 返回 { route, preview }
```

### 4.3 标签注入
```
手动触发 POST /api/data/inject
  → osmPatchService: Python generate_osc.py → changes.osc
  → osmium apply-changes → guangzhou.osm
  → osmium cat → guangzhou.pbf
  → graphHopperService.rebuild() → 等待 GH 就绪
```

### 4.4 实时导航指引（v2.1）
```
前端摄像头 → POST /api/guide/frame (session_id, frame JPEG)
  → realtimeGuideService: VLM 分析当前帧 + 滚动摘要
  → 返回指引文本 → 前端 TTS 播报
```

---

## 五、API 端点总览（21 个）

| 分组 | 方法 | 端点 | 说明 |
|------|------|------|------|
| **健康** | GET | `/health` | 服务存活 |
| **导航** | GET | `/api/navigation/points` | 所有采样点 |
| | POST | `/api/navigation/route` | 路线规划 + 行前预览 |
| **上传** | POST | `/api/upload/metadata` | 创建 session |
| | POST | `/api/upload/image` | 上传单张图片 |
| | GET | `/api/upload/session/:id` | 上传进度 |
| **数据** | GET | `/api/data/tags/pending` | 待注入标签 |
| | GET | `/api/data/tags/stats` | 标签统计 |
| | POST | `/api/data/inject` | 手动触发注入 |
| | GET | `/api/data/gh/status` | GraphHopper 状态 |
| | POST | `/api/data/gh/rebuild` | 手动重建引擎 |
| | GET | `/api/data/workspace` | 工作区状态 |
| **批量** | GET | `/api/batch/pending` | 待处理批次 |
| | GET | `/api/batch/stats` | 批次统计 |
| | POST | `/api/batch/trigger` | 手动触发 |
| | GET | `/api/batch/:id` | 批次详情 |
| **道路** | GET | `/api/road/at?lng=&lat=` | 精确查道路 |
| | GET | `/api/road/geojson` | bbox 查询 GeoJSON |
| | GET/POST/DELETE | `/api/road/:osmId` | 道路标签 CRUD |
| **指引** | POST | `/api/guide/session` | 创建实时指引会话 |
| | POST | `/api/guide/frame` | 提交摄像头帧 |
| | POST | `/api/guide/stop` | 结束指引 |
| | GET | `/api/guide/status` | 查询会话状态 |
| **瓦片** | GET | `/api/tiles/{z}/{x}/{y}.pbf` | 矢量瓦片 |
| | GET | `/api/tiles/tilejson` | 瓦片元数据 |
| **SSE** | GET | `/api/sse/stream?requestId=` | 路线进度 |
| **日志** | GET | `/api/logs/stream` | 后端日志流 |

---

## 六、数据库集合

| 集合 | 用途 | 索引 |
|------|------|------|
| `semantic_tags` | VLM 语义标签（永久） | 2dsphere + status + point_id |
| `pending_uploads` | 上传 session（TTL 24h） | session_id + point_id+status |
| `osm_ways` | OSM pedestrian way（只读镜像） | 2dsphere + highway + osm_id |
| `road_tags` | 道路增强标签（用户编辑） | osm_id unique |
| `batch_tasks` | 批量任务记录 | batch_id + status |
| `osm_working_state` | GraphHopper 切换状态 | 单例文档 |

---

## 七、启动方式

```bash
# 本地开发
cd backend && npm install && node server.js

# 服务器部署
cd E:\Cross-domain_authentication_verification\HeartSight
start_heartsight.bat    # 自动启动 MongoDB + Node.js

# 依赖检查
node -v                 # ≥ 18
netstat -ano | findstr :27017   # MongoDB 运行中
curl http://localhost:5741/health
```

---

## 八、环境变量（.env）

```env
PORT=5741
MONGODB_URI=mongodb://localhost:27017/blind_map
AMAP_WEB_KEY=xxx
BAILIAN_API_KEY=xxx
DEEPSEEK_API_KEY=xxx
GEMINI_API_KEY=xxx
OSM_DATA_DIR=.../osm_data
OSMIUM_PATH=.../osmium.exe
PYTHON_PATH=.../python.exe
GRAPHHOPPER_JAR=.../graphhopper-web-10.0.jar
GRAPHHOPPER_CONFIG=.../config.yml
NODE_ENV=production
```

---

## 九、部署依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 18 | 后端运行 |
| MongoDB | ≥ 5.0 | 数据存储 |
| JDK 17 | Temurin/OpenJDK | GraphHopper |
| Python 3.12 | Anaconda | OSM 数据脚本 |
| osmium 1.19 | 编译版 | OSM 格式转换 |
| planetiler 0.8 | Java 21 | 矢量瓦片生成（一次性） |

---

## 十、架构文档索引

| 文档 | 内容 |
|------|------|
| `ARCHITECTURE/api_contract.md` | 全部 21 个端点的请求/响应格式 |
| `ARCHITECTURE/deployment_deps.md` | 服务器部署依赖清单 + 验证步骤 |
| `ARCHITECTURE/bugfix_report.md` | 已知 Bug 及修复记录（持续更新） |
| `ARCHITECTURE/coupling_report.md` | 耦合度审计（分层违规 + 副作用 + 错误处理） |
| `ARCHITECTURE/refactor_report.md` | v1→v2 重构结项报告 |
| `ARCHITECTURE/v2_architecture.md` | 完整架构设计图 |
| `ARCHITECTURE/way_segmentation.md` | OSM way 分段算法设计 |
| `ARCHITECTURE/batch_infer.md` | 阿里云百炼批量推理使用指南 |
