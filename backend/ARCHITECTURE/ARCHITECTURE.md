# CorSight-Server 后端架构全景图

> 本文档旨在建立对整个后端架构的完整认知，明确每个模块的职责边界、输入输出契约，以及数据流向。

---

## 目录

1. [架构分层总览](#1-架构分层总览)
2. [各层模块详解](#2-各层模块详解)
   - 2.1 [HTTP入口层](#21-http入口层-serverjs)
   - 2.2 [路由层](#22-路由层-routes)
   - 2.3 [控制器层](#23-控制器层-controllers)
   - 2.4 [服务层](#24-服务层-services)
   - 2.5 [中间件层](#25-中间件层-middleware)
   - 2.6 [Agent层](#26-agent层-agents)
   - 2.7 [提示词层](#27-提示词层-prompts)
   - 2.8 [数据层](#28-数据层-data-layer)
   - 2.9 [配置层](#29-配置层-config)
3. [完整请求数据流](#3-完整请求数据流)
4. [关键设计决策](#4-关键设计决策)
5. [模块契约速查表](#5-模块契约速查表)

---

## 1. 架构分层总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 1: HTTP 入口层 (server.js)                                           │
│  Express App + 中间件 + 路由挂载                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 2: 路由层 (Routes)                                                    │
│  /api/navigation, /api/upload, /api/config, /api/map                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 3: 控制器层 (Controllers)                                             │
│  编排器：previewController, fixedRoutePreviewController                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 4: 服务层 (Services)                                                  │
│  amapService, corsightService, llmClient, modelTester                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 5: 中间件层 (Middleware)                                              │
│  spatialMiddleware (核心算法), requestMonitor (SSE监控)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 6: Agent层 (多Agent AI系统)                                          │
│  masterAgent, perceptionAgent, intersectionAgent, terrainAgent, ...         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 7: 提示词层 (Prompts)                                                 │
│  sceneScoutPrompts, defensivePrompts, promptLoader, templates/                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 8: 数据层 (Data Layer)                                                │
│  SamplingPoint.js (Mongoose Model) → MongoDB                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 9: 配置层 (Config)                                                    │
│  envConfig, db.js, database.js, llmConfig.js                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**核心原则**：每一层只与相邻层通信，上层调用下层，下层不感知上层。

---

## 2. 各层模块详解

### 2.1 HTTP入口层 (server.js)

**文件**：`backend/server.js`

**职责**：
- 启动 HTTP 服务
- 连接 MongoDB
- 挂载全局中间件（CORS、JSON解析、请求监控）
- 挂载所有路由
- 提供健康检查端点

**输入**：环境变量（`.env` 或系统环境变量）

**输出**：运行在 `PORT`（默认 5741）的 Express 实例

**关键代码**：
```javascript
// 启动顺序（严格）
1. dotenv.config()           // 加载环境变量
2. config.validate()         // 验证配置
3. connectDB()              // 连接数据库（兼容两个连接模块）
4. app.listen(PORT)         // 启动HTTP服务
```

**不处理**：任何业务逻辑、数据库查询、AI调用。

---

### 2.2 路由层 (Routes)

| 路由文件 | 挂载路径 | 职责 |
|---------|---------|------|
| `navigationRoutes.js` | `/api/navigation` | 导航预览（preview, preview/test, preview/fixed） |
| `mapRoutes.js` | `/api/navigation` | 空间查询（nearby, points, stats, point/:id） |
| `configRoutes.js` | `/api/config/llm` | LLM配置（active, models, probe） |
| `upload.js` | `/api/upload` | 采样点上传（sampling_point, image） |
| `navigation.js` | `/api/navigation` | 遗留地图数据路由 |
| `map.js` | `/api/map` | OSM地图块路由 |

**职责**：
- 解析 HTTP 请求参数（query/body/params）
- 调用 Controller 或 Service
- 返回标准格式 JSON 响应

**输入输出格式**：
```javascript
// 输入：req.query, req.body, req.params
// 输出：
{
  success: true/false,
  data: { ... },        // 成功时
  error: "...",         // 失败时
  message: "..."       // 可选
}
```

**不做**：业务计算、数据库查询、AI调用、文件系统操作。

---

### 2.3 控制器层 (Controllers)

#### previewController.js

**文件**：`backend/controllers/previewController.js`

**职责**：编排完整的导航预览流水线（Pipeline Orchestrator）

**输入**：`{ origin, destination }` 坐标字符串

**输出**：`{ route_summary, key_nodes[], broadcast_text, global_analysis }`

**流水线步骤（严格顺序）**：

```
Step 1: amapService.planRoute(origin, destination)
        → 高德原始路线数据 pathData

Step 2: spatialMiddleware.generateIntermediateRepresentation(pathData)
        → IR 中间表示 JSON

Step 3: perceptionAgent.enrichNodes(ir.key_nodes)
        → 带感知数据的 enriched_nodes

Step 4: masterAgent.analyzeRouteGlobally(ir)
        → 全局分析结果 globalAnalysis

Step 5: languageOptimizerAgent.generate(ir, globalAnalysis)
        → 播报文本 broadcast_text

Step 6: 组装响应
```

**关键特性**：
- 每一步都有错误回退（fallback）
- LLM 失败时回退到规则模板
- 保存调试日志到 `backend/logs/preview/`

#### fixedRoutePreviewController.js

**文件**：`backend/controllers/fixedRoutePreviewController.js`

**职责**：处理预设路线预览（不走高德API，直接构造合成路径）

**输入**：`routeId`（预设路线标识）

**输出**：与 previewController 相同格式

---

### 2.4 服务层 (Services)

#### amapService.js

**文件**：`backend/services/amapService.js`

**职责**：高德地图 Web 服务 API 客户端

**输入**：`{ originLat, originLng, destLat, destLng }`

**输出**：高德原始路线数据（`route.paths[0]`）

**关键**：这是**唯一**接触外部地图 API 的模块。

**API 调用**：
```
GET https://restapi.amap.com/v3/direction/walking
  ?origin={originLng},{originLat}
  &destination={destLng},{destLat}
  &key={AMAP_WEB_KEY}
```

---

#### corsightService.js

**文件**：`backend/services/corsightService.js`

**职责**：本地空间查询服务（查询 MongoDB 采样点）

**输入**：`{ lat, lng, radius=50 }`

**输出**：格式化后的采样点数组（按距离排序）

```javascript
// 输出格式
[
  {
    rank: 1,
    point_id: "P_...",
    location: { latitude: 23.13, longitude: 113.40 },
    scene_description: "...",
    images: { N: "/images/...", NE: "...", ... },
    distance_meters: 12
  }
]
```

**关键**：这是**唯一**接触数据库的 Service。

**策略**：优先本地数据库查询，失败时回退到 HTTP 调用（兼容外部 Blind_map 实例）。

---

#### llmClient.js

**文件**：`backend/services/llmClient.js`

**职责**：统一 LLM 客户端，支持多供应商

**输入**：`{ modelType: 'vision'|'text', prompt, images? }`

**输出**：AI 生成的文本字符串

**支持的供应商**：
| 供应商 | 模型类型 | 用途 |
|-------|---------|------|
| Google Gemini | vision/text | 通用 |
| DeepSeek | text | 播报生成（默认） |
| 阿里云百炼 (Qwen-VL) | vision | 街景图片分析（默认） |

**关键特性**：
- 自动注入 HTTPS 代理（用于翻墙）
- 支持多模态输入（图片作为 base64）
- 失败时自动切换供应商

---

#### modelTester.js

**文件**：`backend/services/modelTester.js`

**职责**：测试各 LLM 供应商的可用性

**用途**：管理后台探测模型状态

---

### 2.5 中间件层 (Middleware)

#### spatialMiddleware.js

**文件**：`backend/middleware/spatialMiddleware.js`

**职责**：核心算法 — 将高德"视觉导航数据"转换为"盲人认知数据"

**输入**：高德 `pathData`（`route.paths[0]`）

**输出**：IR（Intermediate Representation）JSON

```javascript
// IR 输出格式
{
  route_summary: {
    total_distance: "1.2公里",
    duration_estimate: "15分钟",
    original_steps_count: 25,
    key_nodes_count: 8,
    sample_nodes_count: 3,
    total_nodes_count: 11,
    compression_ratio: "56.0%"
  },
  key_nodes: [
    {
      node_index: 1,
      node_type: "key",           // 'key' | 'sample'
      action: "左转",
      assistant_action: "",
      instruction: "向左转进入中山路",
      road: "中山路",
      distance: "50米",
      orientation: "东",
      heading: 90,                // 航向角（0-360°）
      heading_direction: "E",     // 8方向
      relative_direction: "左转",  // 相对于上一节点的方向
      walk_type: 0,               // 高德 walk_type
      polyline: "113.40,23.13;113.41,23.14"  // 原始polyline
    }
  ]
}
```

**核心算法**：

| 函数 | 职责 |
|------|------|
| `isKeyNode(step)` | 判断是否为关键节点（保留） |
| `isStraightSegment(step)` | 判断是否为纯直路（可采样） |
| `createNode(step, ...)` | 构建节点对象，计算 heading 和 relative_direction |
| `calculateHeadingFromPolyline(polyline)` | 从 polyline 前两点计算航向 |
| `calculateBearing(from, to)` | 计算两点间方位角 |
| `generateIntermediateRepresentation(pathData)` | 主函数：过滤 + 采样 + 组装 |

**关键节点判断优先级**：
```
1. walk_type（最可靠）→ SPECIAL_WALK_TYPES 包含的关键类型
2. action → 转向/过马路动作
3. assistant_action → 到达目的地
4. instruction 文本关键词兜底
5. road 名称包含特殊地形
```

**直路采样策略**：
- 纯直路段（`walk_type=0` + 直行类 action）
- 距离上一个采样点超过 **200 米**时插入一个 `sample` 节点

---

#### requestMonitor.js

**文件**：`backend/middleware/requestMonitor.js`

**职责**：SSE 实时请求监控

**实现**：Monkey-patch `res.end`，拦截所有 HTTP 响应并广播到 SSE 客户端。

**端点**：`GET /api/monitor/stream`

---

### 2.6 Agent层 (多Agent AI系统)

**注册中心**：`backend/agents/index.js`

**场景 → Agent 映射**：

| 场景类型 | Agent | 职责 |
|---------|-------|------|
| `intersection` | IntersectionAgent | 路口/斑马线分析 |
| `overpass` | TerrainAgent | 天桥分析 |
| `underpass` | TerrainAgent | 地下通道分析 |
| `steps` | TerrainAgent | 台阶分析 |
| `elevator` | TerrainAgent | 电梯分析 |
| `escalator` | TerrainAgent | 扶梯分析 |
| `path` | PathSegmentAgent | 普通路段分析 |
| `destination` | DestinationAgent | 目的地分析 |

#### masterAgent.js

**文件**：`backend/agents/masterAgent.js`

**职责**：全局路径分析（鸟瞰视角）

**输入**：IR（含 `perception_data` 的节点）

**输出**：
```javascript
{
  stats: { total_overpass, total_crossings, total_turns, ... },
  pairs: [ { type: "overpass", entrance_index, exit_index } ],  // 节点配对
  risk_summary: { no_tactile_paving: [...], mixed_traffic: [...], ... },
  segments: [ { type: "straight", start_index, end_index }, ... ],
  conflicts: [ { type: "tactile_paving_mismatch", severity: "high" }, ... ]
}
```

**关键功能**：
- **节点配对**：识别天桥入口↔出口、地下通道入口↔出口
- **风险汇总**：统计无盲道、机非混行、台阶等风险点
- **冲突检测**：入口有盲道但出口无盲道等不一致情况

---

#### perceptionAgent.js

**文件**：`backend/agents/perceptionAgent.js`

**职责**：为每个 IR 节点获取街景图片并调用 AI 分析

**输入**：`IR.key_nodes[]`

**输出**：`enriched_nodes[]`（每个节点附加 `perception_data`）

**处理流程（每个节点）**：

```
1. extractCoordinates(node)
   → 从 node.lat/lng 或 node.polyline 提取坐标

2. corsightService.getNearbyPoints(lat, lng, 50)
   → 查询 50 米范围内的采样点

3. 取最近点 nearestPoint = nearbyPoints[0]

4. extractImagePaths(nearestPoint)
   → 提取 8 方向图片路径

5. selectRelevantImages(node, allImagePaths)
   → 根据 heading 和场景类型筛选 3-4 张相关图片
   → 路口：左前 + 正前 + 右前 + 正后
   → 其他：左前 + 正前 + 右前

6. selectPromptForNode(node)
   → 判断场景类型（walk_type > action > text 关键词）

7. getAgent(sceneType)
   → 从注册中心获取对应子 Agent

8. agent.analyze(node, selectedPaths, facingDirection)
   → 调用 AI 分析图片

9. 附加 perception_data 到节点
```

**关键问题**：
- 硬编码 **50 米**搜索半径
- 永远只取**第一个**（最近）采样点
- 多个节点可能匹配到**同一个**采样点（无去重）

---

#### languageOptimizerAgent.js

**文件**：`backend/agents/languageOptimizerAgent.js`

**职责**：生成最终的语音播报文本

**输入**：IR + `globalAnalysis` + `perception_data`

**输出**：`{ broadcast_text, segments[] }`

**防御机制**：

| 机制 | 说明 |
|------|------|
| 禁止视觉词汇 | "看见"、"红色"、"绿色" → 替换或删除 |
| 禁止绝对方向 | "东边"、"北面" → 替换为"左转"、"直行" |
| 3段落格式 | `[SEG]` 分隔，强制结构 |
| 输出清洗 | 移除 Markdown、多余空格 |
| 回退机制 | LLM 失败时使用规则模板生成 |

---

### 2.7 提示词层 (Prompts)

#### sceneScoutPrompts.js

**文件**：`backend/prompts/sceneScoutPrompts.js`

**职责**：场景类型判断 + 提示词选择

**场景类型判断优先级**：
```
1. walk_type → 最可靠的结构化标识
2. action → 转向/过马路动作
3. assistant_action → 到达目的地
4. instruction 文本关键词兜底
5. node_type === 'sample' → 默认 'path'
6. 最终 fallback → 'path'
```

#### defensivePrompts.js

**文件**：`backend/prompts/defensivePrompts.js`

**职责**：构建语言优化器的提示词 + 输出清洗

**关键功能**：
- 构建结构化 user prompt（从 IR 数据）
- 强制 3 段落 `[SEG]` 格式
- 清洗视觉词汇（colors, "see", "beautiful"）
- 清洗绝对方向（"东"、"北"）
- 验证输出质量

#### promptLoader.js

**文件**：`backend/prompts/promptLoader.js`

**职责**：从 Markdown 文件加载提示词模板，支持热加载

**模板目录**：`backend/prompts/templates/`

| 模板文件 | 用途 |
|---------|------|
| `perception-intersection.md` | 路口场景 AI 分析提示词 |
| `perception-path.md` | 路段场景 AI 分析提示词 |
| `perception-feature.md` | 地形场景 AI 分析提示词 |
| `perception-destination.md` | 目的地 AI 分析提示词 |
| `language-optimizer-system.md` | 播报生成系统提示词 |

---

### 2.8 数据层 (Data Layer)

#### SamplingPoint.js

**文件**：`backend/models/SamplingPoint.js`

**职责**：定义 Mongoose Schema + 提供数据库操作方法

**Schema**：

```javascript
{
  point_id: {              // 唯一标识符
    type: String,
    required: true,
    unique: true,
    index: true
  },
  location: {              // GeoJSON Point 格式
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]   // [longitude, latitude]
  },
  scene_description: {      // 场景描述
    type: String,
    default: ''
  },
  images: {                // 8 方向图片路径
    N: String, NE: String, E: String, SE: String,
    S: String, SW: String, W: String, NW: String
  }
}
// 索引：location: '2dsphere'（地理空间索引）
// 集合名：sampling_points
// 时间戳：createdAt, updatedAt（自动）
```

**静态方法**：

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `findNearbyPoints(lat, lon, radius=50)` | 纬度, 经度, 半径(米) | 采样点数组 | 使用 `$near` + `2dsphere` 索引 |
| `saveSamplingPoint(data)` | 采样点数据 | 保存后的文档 | `upsert`（存在更新，不存在插入） |
| `findAllPoints()` | 无 | 所有采样点 | 不分页，全量查询 |
| `deleteSamplingPoint(pointId)` | point_id | 删除结果 | 删除文档 |
| `convertDMSToDecimal(dms)` | DMS 字符串 | 十进制度数 | 坐标格式转换工具 |

---

### 2.9 配置层 (Config)

#### envConfig.js

**文件**：`backend/config/envConfig.js`

**职责**：集中管理所有环境变量

**优先级**：`系统环境变量 > .env 文件 > 代码默认值`

**配置分组**：

| 分组 | 关键配置项 | 默认值 |
|------|-----------|--------|
| `server` | PORT, NODE_ENV | 5741, 'development' |
| `database` | MONGODB_URI | 'mongodb://localhost:27017/nav_preview_db' |
| `amap` | AMAP_WEB_KEY | '' |
| `llm` | GEMINI_API_KEY, DEEPSEEK_API_KEY, BAILIAN_API_KEY, HTTP_PROXY | '' |
| `external` | BLINDMAP_URL | 'http://localhost:3001' |

#### db.js / database.js

**文件**：`backend/config/db.js` + `backend/config/database.js`

**职责**：MongoDB 连接（两个文件功能几乎相同，历史遗留）

**server.js 中的兼容逻辑**：
```javascript
try {
  await connectDB();           // 先尝试新的
} catch (e) {
  await connectDatabase();       // 失败再尝试旧的
}
```

#### llmConfig.js

**文件**：`backend/config/llmConfig.js`

**职责**：LLM 模型配置管理

**双模型架构**：
- **视觉模型**（Vision）：`Qwen-VL-Max`（通过百炼）→ 分析街景图片
- **文本模型**（Text）：`DeepSeek-Chat` → 生成播报文字

---

## 3. 完整请求数据流

以 **`POST /api/navigation/preview`** 为例：

```
用户请求
{
  "origin": "116.397,39.909",
  "destination": "116.400,39.910"
}
    │
    ▼
┌─────────────────────────────────────────┐
│  Layer 2: navigationRoutes.js            │
│  解析 body，验证参数                     │
│  调用 previewController.orchestratePipeline()
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Layer 3: previewController.js           │
│  orchestratePipeline()                   │
│  ─────────────────────────────────────   │
│                                          │
│  Step 1: amapService.planRoute()         │
│    ├── 调用高德 /v3/direction/walking    │
│    └── 返回 pathData (原始路线数据)       │
│                                          │
│  Step 2: spatialMiddleware.generateIR()  │
│    ├── isKeyNode() 过滤关键节点           │
│    ├── createNode() 构建节点              │
│    ├── 直路采样（每200m插入sample节点）   │
│    └── 返回 IR JSON                      │
│                                          │
│  Step 3: perceptionAgent.enrichNodes()   │
│    ├── 遍历每个节点                       │
│    │   ├── extractCoordinates()         │
│    │   ├── corsightService.getNearbyPoints(lat, lng, 50)
│    │   │   └── models/SamplingPoint.findNearbyPoints()
│    │   │       └── MongoDB $near 查询    │
│    │   ├── selectRelevantImages()        │
│    │   ├── getAgent(sceneType)            │
│    │   └── agent.analyze()               │
│    │       └── llmClient.generate()      │
│    │           └── 调用 Qwen-VL / DeepSeek
│    └── 返回 enriched_nodes               │
│                                          │
│  Step 4: masterAgent.analyzeRouteGlobally()│
│    ├── computeStats()                    │
│    ├── findNodePairs()                   │
│    ├── computeRiskSummary()              │
│    └── detectConflicts()                 │
│    └── 返回 globalAnalysis               │
│                                          │
│  Step 5: languageOptimizerAgent.generate()│
│    ├── 构建防御性提示词                   │
│    ├── llmClient.generate()              │
│    │   └── 调用 DeepSeek-Chat            │
│    ├── 输出清洗（去视觉词汇/绝对方向）     │
│    └── 返回 broadcast_text               │
│                                          │
│  Step 6: 组装响应                         │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  返回 JSON                               │
│  {                                       │
│    "success": true,                      │
│    "data": {                             │
│      "route_summary": { ... },           │
│      "key_nodes": [ ... ],               │
│      "broadcast_text": "前方50米...",     │
│      "global_analysis": { ... }          │
│    }                                     │
│  }                                       │
└─────────────────────────────────────────┘
```

---

## 4. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| **IR 中间表示** | 自定义 JSON 格式 | 解耦高德 API 格式和下游处理，API 变了只改中间件 |
| **多 Agent 架构** | 8 个专用 Agent | 不同场景需要不同专业知识，通用 Agent 效果差 |
| **防御性提示词** | 规则 + 清洗 + 回退 | LLM 会胡说，必须多层兜底 |
| **Mongoose ODM** | 轻量 ODM | 项目简单，不需要 TypeORM/Sequelize 重型 ORM |
| **双模型架构** | 视觉 + 文本分离 | 看图用 Qwen-VL，写文字用 DeepSeek，各司其职 |
| **50m 搜索半径** | 硬编码经验值 | 覆盖定位误差，但在密集区域可能太大 |
| **200m 直路采样** | 硬编码经验值 | 平衡细节数量和计算成本 |
| **节点坐标提取** | polyline 中点 | 简单但可能不准确，未考虑实际节点位置 |
| **最近点策略** | 永远取 nearbyPoints[0] | 简单但无质量评估，多个节点可能匹配同一点 |
| **连接管理** | 两个兼容模块 | 合并两个旧项目的历史遗留，server.js 中做兼容 |

---

## 5. 模块契约速查表

### 输入输出速查

| 模块 | 输入 | 输出 | 依赖 |
|------|------|------|------|
| `server.js` | 环境变量 | Express 实例 | 所有模块 |
| `navigationRoutes` | HTTP req | HTTP res (JSON) | previewController |
| `previewController` | `{origin, destination}` | `{route_summary, key_nodes, broadcast_text}` | amapService, spatialMiddleware, perceptionAgent, masterAgent, languageOptimizerAgent |
| `amapService` | `{originLat, originLng, destLat, destLng}` | 高德 pathData | 高德 API |
| `spatialMiddleware` | 高德 pathData | IR JSON | 无外部依赖 |
| `perceptionAgent` | `IR.key_nodes[]` | `enriched_nodes[]` | corsightService, agents/index, sceneScoutPrompts |
| `corsightService` | `{lat, lng, radius}` | 采样点数组 | SamplingPoint |
| `SamplingPoint` | 查询条件 | 文档/数组 | MongoDB |
| `masterAgent` | IR（含 perception） | globalAnalysis | 无外部依赖 |
| `languageOptimizerAgent` | IR + globalAnalysis | broadcast_text | llmClient, defensivePrompts |
| `llmClient` | `{modelType, prompt, images?}` | 文本 | Gemini/DeepSeek/百炼 API |

### 错误处理策略

| 层级 | 错误处理 |
|------|---------|
| Service | 抛出错误，由 Controller 捕获 |
| Controller | try-catch，返回 `{success: false, error: "..."}` |
| Agent | 单节点失败返回 `perception_error`，不影响其他节点 |
| LLM | 失败时回退到规则模板（rule-based fallback） |
| 数据库 | 连接失败直接 `process.exit(1)` |

---

## 附录：文件路径索引

```
backend/
├── server.js                          # HTTP 入口
├── app.js                             # 遗留入口（已合并到 server.js）
├── config/
│   ├── envConfig.js                   # 环境变量管理
│   ├── db.js                          # MongoDB 连接（新）
│   ├── database.js                    # MongoDB 连接（旧）
│   ├── llmConfig.js                   # LLM 模型配置
│   └── presetRoutes.js                # 预设路线
├── models/
│   └── SamplingPoint.js               # 采样点模型
├── services/
│   ├── amapService.js                 # 高德 API 客户端
│   ├── corsightService.js             # 空间查询服务
│   ├── llmClient.js                   # 统一 LLM 客户端
│   └── modelTester.js                 # 模型可用性测试
├── middleware/
│   ├── spatialMiddleware.js           # 核心算法（IR生成）
│   └── requestMonitor.js              # SSE 请求监控
├── controllers/
│   ├── previewController.js           # 预览流水线编排
│   └── fixedRoutePreviewController.js # 预设路线预览
├── routes/
│   ├── navigationRoutes.js            # 导航预览路由
│   ├── mapRoutes.js                   # 空间查询路由
│   ├── configRoutes.js                # LLM 配置路由
│   ├── upload.js                      # 采样点上传路由
│   ├── navigation.js                  # 遗留地图路由
│   └── map.js                         # OSM 地图块路由
├── agents/
│   ├── index.js                       # Agent 注册中心
│   ├── masterAgent.js                 # 全局分析 Agent
│   ├── perceptionAgent.js             # 视觉感知调度 Agent
│   ├── intersectionAgent.js           # 路口分析 Agent
│   ├── terrainAgent.js                # 地形分析 Agent
│   ├── pathSegmentAgent.js            # 路段分析 Agent
│   ├── destinationAgent.js            # 目的地分析 Agent
│   └── languageOptimizerAgent.js      # 播报生成 Agent
├── prompts/
│   ├── sceneScoutPrompts.js           # 场景类型判断
│   ├── defensivePrompts.js            # 防御性提示词
│   ├── promptLoader.js                # 模板加载器
│   └── templates/                     # Markdown 模板
│       ├── perception-intersection.md
│       ├── perception-path.md
│       ├── perception-feature.md
│       ├── perception-destination.md
│       └── language-optimizer-system.md
└── logs/
    └── preview/                       # 调试日志
```
