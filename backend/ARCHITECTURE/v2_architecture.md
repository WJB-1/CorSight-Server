# CorSight v2.0 后端架构（改造后）

## 一、目录结构

```
backend/
├── server.js                          # 唯一入口
│
├── config/
│   ├── envConfig.js                   # 环境变量（DB、代理、API keys、路径）
│   ├── db.js                          # MongoDB 连接（唯一）
│   └── uploadConfig.js                # 上传限制、路径、TTL
│
├── routes/                            # 仅做 HTTP 解析 + 参数校验 + 调 controller
│   ├── uploadRoutes.js                # 两步上传
│   │   ├── POST /metadata             # 创建 session（含 fov）
│   │   ├── POST /image                # 上传单张图片
│   │   └── GET  /session/:id          # 查询上传进度
│   ├── dataRoutes.js                  # 数据管理
│   │   ├── GET  /tags/pending         # 待注入标签
│   │   ├── GET  /tags/stats           # 标签统计
│   │   ├── POST /inject               # 手动触发注入
│   │   ├── GET  /gh/status            # GraphHopper 状态
│   │   ├── POST /gh/rebuild           # 手动重建引擎
│   │   └── GET  /workspace            # 工作区状态
│   └── batchRoutes.js                 # 批量任务管理（新增）
│       ├── GET  /batch/pending        # 待处理批次
│       ├── GET  /batch/stats          # 批次统计
│       ├── POST /batch/trigger        # 手动触发批量处理
│       └── GET  /batch/:id            # 批次详情
│
├── controllers/                       # 编排业务流程
│   ├── metadataController.js          # 元数据上传编排
│   ├── imageUploadController.js       # 图片上传编排（改：不触发 VLM）
│   ├── dataController.js              # 数据管理编排
│   └── batchController.js             # 批量任务编排（新增）
│
├── services/                          # 无状态业务能力
│   │
│   │── 【上传存储】
│   ├── uploadSessionService.js        # session CRUD + 状态机
│   ├── imageStorageService.js         # 图片 buffer→磁盘
│   │
│   │── 【场景分析】（新增）
│   ├── viewSectorService.js           # 视野扇区几何计算（bearing+fov→多边形）
│   ├── osmLookupService.js            # 扇区内 OSM 元素检索（Overpass/本地）
│   ├── sceneClassifier.js             # 场景分类决策（OSM元素+walk_type→场景类型）
│   │
│   │── 【批量处理】（新增）
│   ├── batchProcessorService.js       # 缓存池管理 + 批量触发 + 提示词构建 + VLM 调度
│   ├── vlmService.js                  # VLM API 调用封装（单张/批量，占位→后续接入）
│   │
│   │── 【标签合并】（新增）
│   ├── tagMergeService.js             # 多张图片标签融合 → merged_osm_tags + merged_description
│   │
│   │── 【地图注入】
│   ├── osmPatchService.js             # Python 脚本调用 + osmium apply + PBF 生成
│   ├── graphHopperService.js          # GraphHopper 重建（策略模式：A简单重启 / B乒乓）
│   │
│   └── semanticProcessingService.js   # 改造：缓存池触发协调器（不再直接调 VLM）
│
├── models/
│   ├── UploadSession.js               # 临时 session（TTL 24h）
│   ├── SemanticTag.js                 # 永久语义标签（改造：按图片结构化）
│   ├── OsmWorkState.js                # 乒乓切换状态
│   └── BatchTask.js                   # 批量任务（新增）
│
├── lib/                               # 纯工具函数（无副作用）
│   ├── idGenerator.js                 # session/batch/point ID 生成
│   ├── geo.js                         # Haversine、Bearing、视野扇区几何（新增）
│   └── polyline.js                    # Polyline 解码（后续需要时添加）
│
├── middleware/
│   └── (保留给真正的 Express middleware)
│
├── prompts/                           # LLM 提示词模板（新增）
│   ├── templates/
│   │   ├── perception-steps.md        # 台阶场景提示词
│   │   ├── perception-crossing.md     # 人行横道提示词
│   │   ├── perception-overpass.md     # 天桥/地下通道提示词
│   │   ├── perception-path.md         # 普通路段提示词
│   │   ├── perception-subway.md       # 地铁入口提示词
│   │   └── perception-generic.md      # 通用场景提示词
│   └── promptLoader.js                # 模板加载器
│
└── scripts/
    └── generate_osc.py                # OSM 补丁生成（Python，已实现）
```

---

## 二、数据结构

### 2.1 UploadSession（临时，TTL 24h）

```javascript
{
  session_id: "S_xxx",
  point_id: "P_xxx",
  location: { type: "Point", coordinates: [lng, lat] },
  scene_description: "天桥入口附近有盲道",   // 可选，客户端描述
  images: {
    "0": {                                // key = bearing 字符串
      fov: 90,                            // ★ 新增：该图片的水平视场角
      description: "正前方盲道",
      uploaded: false,
      path: null,
      scene_type: null,                   // ★ 新增：分类结果（待填充）
      scene_context: null,                // ★ 新增：分类上下文（OSM元素等）
      status: "pending"                   // ★ 新增：pending → classified → processed
    },
    "45": { fov: 120, ... },
    "180": { fov: 60, ... }
  },
  batch_id: null,                         // ★ 新增：所属批次 ID
  status: "metadata_received",
  // metadata_received → partial_upload → complete → batched → processing → done | failed
  expireAt: ISODate(...),
  created_at: ISODate(...),
  updated_at: ISODate(...)
}
```

### 2.2 SemanticTag（永久）

```javascript
{
  point_id: "P_xxx",
  location: { type: "Point", coordinates: [lng, lat] },
  scene_description: "...",

  // ★ 改造：每张图片的独立分析结果
  images: [
    {
      bearing: 0,
      fov: 90,
      path: "/images/P_xxx_0_123.jpg",
      scene_type: "crossing",             // 场景分类
      agent_name: "crossing_agent",       // 使用的 Agent
      osm_tags: {                         // 该张图的 OSM 标签
        "highway": "crossing",
        "crossing": "traffic_signals",
        "tactile_paving": "yes",
        "traffic_signals:sound": "walk"
      },
      description: "有声信号灯人行横道，有触觉路面",
      confidence: 0.92
    },
    {
      bearing: 90,
      fov: 80,
      path: "/images/P_xxx_90_456.jpg",
      scene_type: "path",
      agent_name: "path_agent",
      osm_tags: { "highway": "footway", "surface": "asphalt" },
      description: "普通沥青人行道",
      confidence: 0.88
    }
  ],

  // ★ 新增：融合后的标签（取多数投票/合并）
  merged_osm_tags: {
    "tactile_paving": "yes",
    "surface": "asphalt",
    "highway": "footway",
    "crossing": "traffic_signals"
  },
  merged_description: "位于人行横道旁，有声信号灯和触觉路面，普通沥青人行道",

  // OSM 匹配（不变）
  matched_osm_id: 12345678,
  matched_osm_type: "way",
  match_distance_m: 3.2,

  status: "pending",   // pending → patched → failed
  error: null,
  created_at: ISODate(...),
  updated_at: ISODate(...)
}
```

### 2.3 BatchTask（新增）

```javascript
{
  batch_id: "B_xxx",
  status: "pending",    // pending → processing → completed → failed
  session_ids: ["S_xxx", "S_yyy"],
  total_images: 24,
  processed_images: 0,
  // 按场景类型分组的统计
  groups: {
    "crossing": 8,
    "path": 12,
    "overpass": 4
  },
  error: null,
  created_at: ISODate(...),
  updated_at: ISODate(...)
}
```

---

## 三、数据流（改造后）

```
                                    ┌─────────────────────────────────┐
                                    │         采集缓存池              │
                                    │    (不立即触发 VLM)             │
[安卓客户端]                        │                                 │
  │                                 │  UploadSession:                 │
  ├─ POST /metadata ──────────────→ │    images[0]  = {fov:90}        │
  │   (point_id, location,          │    images[45] = {fov:120}       │
  │    images[{bearing,fov,desc}])  │    images[180]= {fov:60}        │
  │                                 │                                 │
  ├─ POST /image ×N ──────────────→ │    status: partial_upload       │
  │   (session_id, bearing, file)   │              ↓                  │
  │                                 │    status: complete             │
  │                                 └──────────────┬──────────────────┘
  │                                                │
  │                                    ┌───────────▼──────────────┐
  │                                    │   缓存池触发条件检查      │
  │                                    │   ├ session 全部到齐     │
  │                                    │   ├ 数量阈值 (N张)       │
  │                                    │   ├ 时间阈值 (T分钟)     │
  │                                    │   └ 手动触发             │
  │                                    └───────────┬──────────────┘
  │                                                │
  │                                    ┌───────────▼──────────────┐
  │                                    │   批量任务创建            │
  │                                    │   batchProcessorService  │
  │                                    │   创建 BatchTask         │
  │                                    │   标记 session=batched   │
  │                                    └───────────┬──────────────┘
  │                                                │
  │                    ┌───────────────────────────▼──────────────────────────┐
  │                    │              逐张场景分类                             │
  │                    │                                                     │
  │                    │  1. viewSectorService                               │
  │                    │     bearing + fov + 坐标 → 扇形多边形                │
  │                    │                                                     │
  │                    │  2. osmLookupService                                │
  │                    │     扇形多边形 → Overpass 查询 → OSM 元素列表        │
  │                    │     (或本地 workspace.osm 离线查询)                  │
  │                    │                                                     │
  │                    │  3. sceneClassifier                                 │
  │                    │     OSM元素 + walk_type → 场景类型                   │
  │                    │     ┌─────────────────────────────────────┐          │
  │                    │     │ highway=steps      → StepsAgent     │          │
  │                    │     │ highway=crossing   → CrossingAgent  │          │
  │                    │     │ bridge=yes         → OverpassAgent  │          │
  │                    │     │ railway=subway_*   → SubwayAgent    │          │
  │                    │     │ highway=footway    → PathAgent      │          │
  │                    │     │ 其他               → GenericAgent   │          │
  │                    │     └─────────────────────────────────────┘          │
  │                    └───────────────────────────┬──────────────────────────┘
  │                                                │
  │                    ┌───────────────────────────▼──────────────────────────┐
  │                    │           批量提示词构建 + VLM 推理                   │
  │                    │                                                     │
  │                    │  1. 按 scene_type 分组图片                            │
  │                    │  2. 每组用对应 prompts/templates/ 模板               │
  │                    │  3. 打包为 JSONL → 提交 VLM 批量 API                 │
  │                    │     (阿里云百炼 Batch / DeepSeek / Gemini)           │
  │                    │  4. 轮询结果 → 按 custom_id 回写                     │
  │                    │                                                     │
  │                    │  vlmService.analyze() → { osm_tags, description }   │
  │                    └───────────────────────────┬──────────────────────────┘
  │                                                │
  │                    ┌───────────────────────────▼──────────────────────────┐
  │                    │           标签合并 + 写入 SemanticTag                 │
  │                    │                                                     │
  │                    │  tagMergeService                                      │
  │                    │    多张图片 osm_tags → merged_osm_tags                │
  │                    │    多张图片 description → merged_description          │
  │                    │                                                     │
  │                    │  写入 SemanticTag (status=pending)                   │
  │                    └───────────────────────────┬──────────────────────────┘
  │                                                │
  │                    ┌───────────────────────────▼──────────────────────────┐
  │                    │           OSM 注入 + GraphHopper 重建                │
  │                    │                                                     │
  │                    │  osmPatchService                                      │
  │                    │    pending tags → Python generate_osc.py              │
  │                    │    → osmium apply-changes → workspace.pbf            │
  │                    │                                                     │
  │                    │  graphHopperService                                   │
  │                    │    → 重建索引（方案A重启 / 方案B乒乓）                │
  │                    │                                                     │
  │                    │  SemanticTag.status = patched                        │
  │                    └──────────────────────────────────────────────────────┘
```

---

## 四、依赖方向（严格单向，无环）

```
routes ──→ controllers ──→ services ──→ models
                                  ↘ lib/ (纯函数)
                                  ↘ config/ (只读配置)
                                  ↘ scripts/ (child_process 调用)
                                  ↘ prompts/ (模板文件读取)

middleware/ (真正的 Express 中间件，req/res/next)

禁止：
  ✗ routes 直接操作 models
  ✗ services 反向调用 controllers
  ✗ lib/ 引用 services 或 models
  ✗ prompts/ 引用 services 或 agents
```

---

## 五、各文件职责清单

| 层 | 文件 | 职责 | 改动 |
|----|------|------|------|
| **routes** | uploadRoutes.js | 两步上传路由 + multer | 不变 |
| | dataRoutes.js | 数据管理路由 | 不变 |
| | batchRoutes.js | 批量任务路由 | **新增** |
| **controllers** | metadataController.js | 创建 session | **改**：加 fov 校验 |
| | imageUploadController.js | 上传图片 + 检查缓存池触发 | **改**：移除 VLM 触发，改为检查批量条件 |
| | dataController.js | 标签/GH/workspace 管理 | 不变 |
| | batchController.js | 批量任务管理 | **新增** |
| **services** | uploadSessionService.js | session CRUD | **改**：schema 加 fov/scene_type/status |
| | imageStorageService.js | 图片存储 | 不变 |
| | viewSectorService.js | 视野扇区几何计算 | **新增** |
| | osmLookupService.js | 扇区内 OSM 元素检索 | **新增** |
| | sceneClassifier.js | 场景分类决策 | **新增** |
| | batchProcessorService.js | 缓存池 + 批量提示词 + VLM 调度 | **新增** |
| | vlmService.js | VLM API 调用封装 | **新增**（占位） |
| | tagMergeService.js | 多图标签融合 | **新增** |
| | osmPatchService.js | OSC 生成 + osmium apply | 不变 |
| | graphHopperService.js | 引擎重建（策略模式） | 不变 |
| | semanticProcessingService.js | 缓存池触发协调 | **改**：从"直接调VLM"改为"协调批量流程" |
| **models** | UploadSession.js | 临时 session | **改**：images 加 fov/scene_type/status，加 batch_id |
| | SemanticTag.js | 永久标签 | **改**：tags→images数组+merged |
| | OsmWorkState.js | 乒乓状态 | 不变 |
| | BatchTask.js | 批量任务 | **新增** |
| **lib** | idGenerator.js | ID 生成 | 不变 |
| | geo.js | 视野扇区 + Haversine + Bearing | **新增** |
| **prompts** | templates/*.md | 各场景 Agent 提示词 | **新增**（6 个模板） |
| | promptLoader.js | 模板加载器 | **新增** |
| **scripts** | generate_osc.py | Python OSM 匹配 | 不变 |

---

## 六、当前状态 → 改造后的渐进步骤

```
已实现 ✅                              待改造 🔧
─────────                              ─────────
两步上传 (metadata + image)     →     加 fov 字段
imageStorageService             →     不变
uploadSessionService            →     schema 扩展
semanticProcessingService       →     重写为缓存池协调器
osmPatchService                 →     不变
graphHopperService              →     不变
generate_osc.py                 →     不变
dataController + routes         →     不变

                                      新增 🔨
                                      ─────
                                      viewSectorService
                                      osmLookupService
                                      sceneClassifier
                                      batchProcessorService
                                      vlmService (占位)
                                      tagMergeService
                                      BatchTask model
                                      batchController + routes
                                      prompts/templates/*.md
                                      lib/geo.js
```
