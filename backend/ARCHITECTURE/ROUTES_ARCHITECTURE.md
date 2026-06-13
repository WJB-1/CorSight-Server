# 路由层架构文档（Route Layer Architecture）

> 本文档详细记录 CorSight-Server 路由层的全部端点、挂载关系、调用方，以及存在的问题。
> 最后更新：2026-06-12

---

## 目录

1. [路由层总览](#1-路由层总览)
2. [路由挂载关系](#2-路由挂载关系)
3. [6 个路由文件详解](#3-6-个路由文件详解)
   - 3.1 [navigationRoutes.js](#31-navigationroutesjs)
   - 3.2 [mapRoutes.js](#32-maproutesjs)
   - 3.3 [configRoutes.js](#33-configroutesjs)
   - 3.4 [upload.js](#34-uploadjs)
   - 3.5 [navigation.js](#35-navigationjs)
   - 3.6 [map.js](#36-mapjs)
4. [路由冲突分析](#4-路由冲突分析)
5. [端点冗余分析](#5-端点冗余分析)
6. [废弃路由清单](#6-废弃路由清单)
7. [问题汇总](#7-问题汇总)
8. [清理建议](#8-清理建议)

---

## 1. 路由层总览

### 文件清单

| # | 文件 | 挂载路径 | 状态 | 端点数量 |
|---|------|---------|------|---------|
| 1 | `navigationRoutes.js` | `/api/navigation` | ✅ 在用 | 5 |
| 2 | `mapRoutes.js` | `/api/navigation` | ✅ 在用 | 5 |
| 3 | `configRoutes.js` | `/api/config/llm` | ✅ 在用 | 10 |
| 4 | `upload.js` | `/api/upload` | ✅ 在用 | 2 |
| 5 | `navigation.js` | `/api/navigation` | ❌ 废弃 | 2 |
| 6 | `map.js` | `/api/map` | ❓ 无人调用 | 1 |

**总计**：25 个端点，其中 **6 个废弃/冗余**，**4 个功能重叠**。

---

## 2. 路由挂载关系

### server.js 中的挂载顺序（关键！）

```javascript
// backend/server.js 第 39-60 行

// 导航预览路由（server.js 原有）
const mapRoutes = require('./routes/mapRoutes');
const configRoutes = require('./routes/configRoutes');
const navigationRoutes = require('./routes/navigationRoutes');

// 地图数据路由（app.js 原有，现在合并到 5741）
const uploadRoutes = require('./routes/upload');
const blindMapNavigationRoutes = require('./routes/navigation');  // ← 废弃
const mapChunkRoutes = require('./routes/map');                    // ← 无人调用

// 挂载路由
app.use('/api/navigation', mapRoutes);              // 第1个挂载
app.use('/api/config/llm', configRoutes);           // 独立路径
app.use('/api/navigation', navigationRoutes);       // 第2个挂载（同路径！）
app.use('/api/upload', uploadRoutes);               // 独立路径
app.use('/api/navigation', blindMapNavigationRoutes); // 第3个挂载（同路径！）
app.use('/api/map', mapChunkRoutes);                // 独立路径
```

### 挂载冲突图示

```
路径 /api/navigation 被挂载了 3 次：

第1次：mapRoutes.js
    ├── GET /nearby
    ├── GET /points
    ├── GET /stats
    ├── GET /point/:pointId
    └── DELETE /point/:pointId

第2次：navigationRoutes.js
    ├── POST /preview
    ├── GET /preview/test
    ├── GET /preview/health
    ├── GET /preview/fixed
    └── POST /preview/fixed/:routeId

第3次：navigation.js（废弃）
    ├── GET /nearby          ← ❌ 永远不会被匹配到！
    └── DELETE /point/:pointId  ← ❌ 永远不会被匹配到！
```

**Express 路由匹配规则**：同一 `app.use('/path', router)` 多次挂载时，请求按顺序匹配第一个能处理的 handler。如果前面的 router 有相同路径，后面的永远不会执行。

---

## 3. 6 个路由文件详解

### 3.1 navigationRoutes.js

**文件**：`backend/routes/navigationRoutes.js`

**状态**：✅ **在用 — 核心路由**

**挂载路径**：`/api/navigation`

**端点清单**：

| 方法 | 路径 | 处理函数 | 用途 | 调用方 |
|------|------|---------|------|--------|
| `POST` | `/preview` | `previewController.generatePreview` | 生成导航预览 | Android `TripPreviewService.sendPreviewRequest()` |
| `GET` | `/preview/test` | `previewController.testPreview` | 测试端点（预设坐标） | 前端管理台（调试用） |
| `GET` | `/preview/health` | `previewController.healthCheck` | 健康检查 | 前端管理台 / 监控 |
| `GET` | `/preview/fixed` | `fixedRouteController.listFixedRoutes` | 列出固定路线 | 前端管理台 |
| `POST` | `/preview/fixed/:routeId` | `fixedRouteController.generateFixedPreview` | 固定路线预览 | Android `TripPreviewService.sendFixedPreviewRequest()` |

**代码结构**：
```javascript
const router = express.Router();
const previewController = require('../controllers/previewController');
const fixedRouteController = require('../controllers/fixedRoutePreviewController');

router.post('/preview', previewController.generatePreview);
router.get('/preview/test', previewController.testPreview);
router.get('/preview/health', previewController.healthCheck);
router.get('/preview/fixed', fixedRouteController.listFixedRoutes);
router.post('/preview/fixed/:routeId', fixedRouteController.generateFixedPreview);

module.exports = router;
```

**特点**：
- 所有端点都调用 Controller，不直接调用 Service
- 路径以 `/preview` 为前缀，与 mapRoutes 的路径不冲突

---

### 3.2 mapRoutes.js

**文件**：`backend/routes/mapRoutes.js`

**状态**：✅ **在用 — 核心路由**

**挂载路径**：`/api/navigation`

**端点清单**：

| 方法 | 路径 | 处理函数 | 用途 | 调用方 |
|------|------|---------|------|--------|
| `GET` | `/nearby` | 内联 handler | 查询附近采样点 | Android `VisionTestActivity` / 前端管理台 `MapViewer` / `perceptionAgent` |
| `GET` | `/point/:pointId` | 内联 handler | 获取单个采样点 | 前端管理台 |
| `GET` | `/points` | 内联 handler | 获取所有采样点 | 前端管理台 `Dashboard` / `StreetView` / `MapDebug` |
| `GET` | `/stats` | 内联 handler | 采样点统计 | 前端管理台 `Dashboard` |
| `DELETE` | `/point/:pointId` | 内联 handler | 删除采样点 | 前端管理台 `StreetView` |

**代码结构**：
```javascript
const router = express.Router();
const corsightService = require('../services/corsightService');

router.get('/nearby', async (req, res) => {
    // 直接调用 Service，没有 Controller
    const points = await corsightService.getNearbyPoints(lat, lon, radius);
    res.json({ success: true, data: points });
});

router.get('/stats', async (req, res) => {
    // 直接查 Model，跳过了 Service 层！
    const { SamplingPoint } = require('../models/SamplingPoint');
    const total = await SamplingPoint.countDocuments();
    // ...
});

router.delete('/point/:pointId', async (req, res) => {
    // 直接调用 Model 方法
    const { deleteSamplingPoint } = require('../models/SamplingPoint');
    await deleteSamplingPoint(pointId);
    // 还做了文件系统操作（删除图片）
});
```

**问题**：
- 没有 Controller，直接在路由里写业务逻辑
- `/stats` 和 `/delete` 直接调用 Model，跳过了 Service 层
- `/delete` 还做了文件系统操作（删除图片），超出了路由层职责

---

### 3.3 configRoutes.js

**文件**：`backend/routes/configRoutes.js`

**状态**：✅ **在用 — 但端点过多**

**挂载路径**：`/api/config/llm`

**端点清单（10 个）**：

| # | 方法 | 路径 | 用途 | 调用方 |
|---|------|------|------|--------|
| 1 | `POST` | `/` | 保存 LLM 配置（provider + model） | 前端管理台（已废弃） |
| 2 | `GET` | `/active` | 当前激活配置 | 前端管理台 `ConfigPanel` |
| 3 | `GET` | `/models` | 所有可用模型列表 | 前端管理台 |
| 4 | `GET` | `/probe` | 探测模型可用性 | 前端管理台（手动触发） |
| 5 | `GET` | `/status` | 配置状态汇总 | 无人调用 |
| 6 | `GET` | `/env-info` | 环境变量信息（脱敏） | 前端管理台 `ConfigPanel` |
| 7 | `GET` | `/models/classified` | 分类模型（视觉/文本） | 无人调用 |
| 8 | `POST` | `/models/vision` | 设置视觉模型 | 无人调用 |
| 9 | `POST` | `/models/text` | 设置文本模型 | 无人调用 |
| 10 | `GET` | `/probed-models` | 探测后的可用模型（带延迟） | 无人调用 |

**冗余分析**：

| 端点 | 冗余原因 | 等价替代 |
|------|---------|---------|
| `GET /status` | 信息 = `/active` + `/env-info` | 调两次即可 |
| `GET /models/classified` | 信息 = `/models` 的子集 | 前端自己分类 |
| `GET /probed-models` | 信息 = `GET /probe` + 过滤 | 调 `/probe` 后过滤 |
| `POST /models/vision` | 和 `POST /` 功能重叠 | 用 `POST /` 设置 |
| `POST /models/text` | 和 `POST /` 功能重叠 | 用 `POST /` 设置 |

**谁在调用**：
- 前端 `ConfigPanel.js` → `GET /active`, `GET /env-info`
- 其余端点**无人调用**

---

### 3.4 upload.js

**文件**：`backend/routes/upload.js`

**状态**：✅ **在用 — 核心路由**

**挂载路径**：`/api/upload`

**端点清单**：

| 方法 | 路径 | 用途 | 调用方 |
|------|------|------|--------|
| `POST` | `/sampling_point` | 上传采样点（JSON + 8张图片） | Android `UploadService.uploadTask()` |
| `POST` | `/image` | 单张图片补传 | Android `UploadService.uploadSingleImage()` |

**特点**：
- 使用 `multer` 处理 multipart/form-data 文件上传
- 包含复杂的文件处理逻辑（重命名、覆盖旧文件、错误清理）
- 直接在路由里做了大量业务逻辑（200+ 行），没有 Controller

**问题**：
- 没有 Controller，业务逻辑直接写在路由里
- 文件系统操作（重命名、删除）应该在 Service 层

---

### 3.5 navigation.js

**文件**：`backend/routes/navigation.js`

**状态**：❌ **废弃 — 功能被 mapRoutes.js 完全覆盖**

**挂载路径**：`/api/navigation`（与 mapRoutes.js 同路径，第3个挂载）

**端点清单**：

| 方法 | 路径 | 用途 | 状态 |
|------|------|------|------|
| `GET` | `/nearby` | 查询附近采样点 | ❌ 永远不会被匹配到 |
| `DELETE` | `/point/:pointId` | 删除采样点 | ❌ 永远不会被匹配到 |

**为什么废弃**：

```javascript
// server.js 挂载顺序
app.use('/api/navigation', mapRoutes);              // 第1个（有 GET /nearby）
app.use('/api/navigation', navigationRoutes);       // 第2个
app.use('/api/navigation', blindMapNavigationRoutes); // 第3个（navigation.js）
```

当请求 `GET /api/navigation/nearby` 时：
1. Express 先检查 `mapRoutes`（第1个挂载）
2. `mapRoutes` 有 `GET /nearby`，匹配成功，执行
3. `navigation.js`（第3个挂载）永远不会被检查到

**代码对比**（功能完全重复）：

```javascript
// mapRoutes.js 的 GET /nearby
router.get('/nearby', async (req, res) => {
    const points = await corsightService.getNearbyPoints(lat, lon, radius);
    res.json({ success: true, data: points });
});

// navigation.js 的 GET /nearby（永远不会执行）
router.get('/nearby', async (req, res) => {
    const nearbyPoints = await findNearbyPoints(latitude, longitude, searchRadius);
    // 自己计算 Haversine 距离（而不是用 corsightService）
    // 参数验证更详细（有经纬度范围检查）
    // 直接调用 Model（跳过了 Service 层）
});
```

**navigation.js 的"独特"之处**（虽然没人用）：
- 参数验证更严格（有经纬度范围检查）
- 自己计算 Haversine 距离（而不是依赖 corsightService）
- 直接调用 `findNearbyPoints()`（跳过了 Service 层）
- 返回格式包含 `query` 元数据

**结论**：这是**旧代码**，功能被 `mapRoutes.js` + `corsightService.js` 取代，应该删除。

---

### 3.6 map.js

**文件**：`backend/routes/map.js`

**状态**：❓ **无人调用 — 可能是预留功能**

**挂载路径**：`/api/map`

**端点清单**：

| 方法 | 路径 | 用途 | 调用方 |
|------|------|------|--------|
| `GET` | `/chunk?bbox=` | 查询 OSM 地图数据 | **无人调用** |

**功能**：
- 调用 Overpass API（OpenStreetMap）查询指定 bbox 内的行人道路数据
- 将 OSM 数据转换为 GeoJSON 格式
- 只查询 pedestrian、footway、steps、crossing 等行人相关要素

**代码特点**：
```javascript
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

router.get('/chunk', async (req, res) => {
    // 构造 Overpass QL 查询语句
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["highway"="pedestrian"](${minLat},${minLon},${maxLat},${maxLon});
        way["highway"="footway"](${minLat},${minLon},${maxLat},${maxLon});
        way["highway"="steps"](${minLat},${minLon},${maxLat},${maxLon});
        node["highway"="crossing"](${minLat},${minLon},${maxLat},${maxLon});
      );
      out body;
      >;
      out skel qt;
    `;
    
    const response = await axios.post(OVERPASS_API_URL, overpassQuery);
    const geoJson = convertOSMToGeoJSON(response.data);
    res.json({ success: true, data: { geojson: geoJson } });
});
```

**搜索调用方**：
- Android 端：无
- 前端管理台：无
- 后端内部：无

**结论**：这是一个**独立功能**，可能是为未来的"地图数据层"准备的，但**当前无人使用**。可以保留作为预留功能，或注释掉减少维护负担。

---

## 4. 路由冲突分析

### 冲突矩阵

| 路径 | mapRoutes.js | navigation.js | 结果 |
|------|-------------|---------------|------|
| `GET /api/navigation/nearby` | ✅ 有 | ✅ 有 | **mapRoutes 生效**（先挂载） |
| `DELETE /api/navigation/point/:id` | ✅ 有 | ✅ 有 | **mapRoutes 生效**（先挂载） |

### 冲突影响

```
请求：GET /api/navigation/nearby?lat=23.1&lon=113.4&radius=50
    │
    ▼
┌─────────────────────────────────────────┐
│  mapRoutes.js（第1个挂载）              │
│  ├── GET /nearby 匹配成功！             │
│  └── 执行 corsightService.getNearbyPoints()
│      └── 返回格式化数据                  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  navigation.js（第3个挂载）              │
│  ├── GET /nearby 也匹配                  │
│  └── ❌ 永远不会执行！                   │
│      （Express 已经找到 handler 了）       │
└─────────────────────────────────────────┘
```

**风险**：
- 开发者可能误以为 `navigation.js` 的代码在生效（比如它的参数验证更严格）
- 修改 `navigation.js` 的代码不会产生任何效果，造成维护困惑

---

## 5. 端点冗余分析

### configRoutes.js 端点冗余

```
GET /api/config/llm/active
    ├── 返回：当前 provider, model_name, api_key_configured
    └── 调用方：前端 ConfigPanel

GET /api/config/llm/status
    ├── 返回：configured_providers + active_config + env_key_map + candidate_models
    └── 调用方：无人调用
    └── 冗余原因：= /active + /env-info + /models 的组合

GET /api/config/llm/env-info
    ├── 返回：环境变量状态（脱敏）
    └── 调用方：前端 ConfigPanel

GET /api/config/llm/models
    ├── 返回：所有可用模型列表
    └── 调用方：前端（可能）

GET /api/config/llm/models/classified
    ├── 返回：按视觉/文本分类的模型
    └── 调用方：无人调用
    └── 冗余原因：前端可以从 /models 自己分类

GET /api/config/llm/probe
    ├── 返回：所有候选模型的探测结果
    └── 调用方：前端（手动触发）

GET /api/config/llm/probed-models
    ├── 返回：探测通过的模型，按视觉/文本分类，带延迟
    └── 调用方：无人调用
    └── 冗余原因：= /probe + 过滤 + 分类

POST /api/config/llm/
    ├── 保存：provider + model_name
    └── 调用方：前端（已废弃，因为 API Key 从 env 读取）

POST /api/config/llm/models/vision
    ├── 设置视觉模型
    └── 调用方：无人调用
    └── 冗余原因：可以用 POST / 设置

POST /api/config/llm/models/text
    ├── 设置文本模型
    └── 调用方：无人调用
    └── 冗余原因：可以用 POST / 设置
```

**实际在用端点**：`GET /active`, `GET /env-info`, `GET /models`, `GET /probe`（4 个）
**冗余端点**：`GET /status`, `GET /models/classified`, `GET /probed-models`, `POST /`, `POST /models/vision`, `POST /models/text`（6 个）

---

## 6. 废弃路由清单

| 文件 | 端点 | 废弃原因 | 替代方案 |
|------|------|---------|---------|
| `navigation.js` | `GET /nearby` | 与 `mapRoutes.js` 路径冲突，永远不会执行 | 使用 `mapRoutes.js` 的 `/nearby` |
| `navigation.js` | `DELETE /point/:id` | 与 `mapRoutes.js` 路径冲突，永远不会执行 | 使用 `mapRoutes.js` 的 `/point/:id` |
| `map.js` | `GET /chunk` | 无人调用，功能独立 | 保留或删除 |
| `configRoutes.js` | `GET /status` | 信息可由其他端点组合获得 | 调 `/active` + `/env-info` |
| `configRoutes.js` | `GET /models/classified` | 前端可从 `/models` 自己分类 | 调 `/models` 后过滤 |
| `configRoutes.js` | `GET /probed-models` | 等价于 `/probe` + 过滤 | 调 `/probe` 后处理 |
| `configRoutes.js` | `POST /` | API Key 从 env 读取，前端不再配置 | 直接改 `.env` |
| `configRoutes.js` | `POST /models/vision` | 和 `POST /` 功能重叠 | 用 `POST /` |
| `configRoutes.js` | `POST /models/text` | 和 `POST /` 功能重叠 | 用 `POST /` |

---

## 7. 问题汇总

### 问题1：路由冲突（严重）

**位置**：`server.js` 第 52-59 行

**现象**：`navigation.js` 和 `mapRoutes.js` 挂载在同一路径 `/api/navigation`，有重复端点。

**影响**：`navigation.js` 的代码永远不会执行，但开发者可能误以为它在生效。

**修复**：删除 `navigation.js`，或将其独特功能（参数验证）合并到 `mapRoutes.js`。

---

### 问题2：路由层直接调用 Model（分层违规）

**位置**：`mapRoutes.js` 第 152-172 行（stats 端点）

```javascript
router.get('/stats', async (req, res) => {
    const { SamplingPoint } = require('../models/SamplingPoint');  // ← 直接调 Model！
    const totalPoints = await SamplingPoint.countDocuments();       // ← 跳过 Service！
    const todayPoints = await SamplingPoint.countDocuments({ createdAt: { $gte: todayStart } });
    // ...
});
```

**影响**：破坏了分层架构，Service 层被绕过。

**修复**：将数据库操作封装到 `corsightService.js`。

---

### 问题3：路由层做文件系统操作（职责越界）

**位置**：`mapRoutes.js` 第 179-224 行（DELETE 端点）

```javascript
router.delete('/point/:pointId', async (req, res) => {
    const result = await deleteSamplingPoint(pointId);  // 调 Model
    
    // 删除关联的图片文件 ← 文件系统操作！
    const uploadDir = path.join(__dirname, '../public/images');
    directions.forEach(dir => {
        const imgPath = path.join(uploadDir, `${pointId}_${dir}.jpg`);
        if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath);  // ← 路由层在做文件操作！
        }
    });
});
```

**影响**：路由层做了本应在 Service 层做的事。

**修复**：将图片删除逻辑封装到 `corsightService.js` 或新建 `fileService.js`。

---

### 问题4：upload.js 没有 Controller（200+ 行业务逻辑）

**位置**：`upload.js` 第 86-246 行

**现象**：文件上传、解析、重命名、数据库写入、错误回滚全部写在路由里。

**影响**：路由文件过于臃肿，难以维护和测试。

**修复**：抽取 `UploadController` 或 `UploadService`。

---

### 问题5：configRoutes 端点过多（10 个）

**位置**：`configRoutes.js`

**现象**：大量端点功能重叠，很多无人调用。

**影响**：维护成本高，前端调用困惑。

**修复**：合并精简到 4-5 个核心端点。

---

## 8. 清理建议

### 方案A：最小改动（保留兼容）

```
删除：
  ❌ backend/routes/navigation.js  （完全废弃，功能被覆盖）

保留：
  ✅ backend/routes/navigationRoutes.js
  ✅ backend/routes/mapRoutes.js
  ✅ backend/routes/configRoutes.js  （但注释掉冗余端点）
  ✅ backend/routes/upload.js
  ❓ backend/routes/map.js  （注释掉，保留代码）
```

### 方案B：彻底重构（推荐）

```
删除：
  ❌ backend/routes/navigation.js
  ❌ backend/routes/map.js  （如果确认无人使用）

修改：
  🔧 backend/routes/mapRoutes.js
      ├── 将 /stats 和 /delete 的 Model 调用移到 corsightService.js
      └── 将文件删除逻辑移到 Service 层
      
  🔧 backend/routes/configRoutes.js
      ├── 删除：POST /, GET /status, GET /models/classified, GET /probed-models, POST /models/vision, POST /models/text
      └── 保留：GET /active, GET /env-info, GET /models, GET /probe
      
  🔧 backend/routes/upload.js
      └── 抽取 UploadController，路由只负责 HTTP 协议
```

### 重构后的路由层结构

```
routes/
├── index.js              # 统一导出所有路由（替代 server.js 中的逐个 require）
├── navigationRoutes.js   # 导航预览（5 个端点）
├── mapRoutes.js          # 空间查询（5 个端点，但调用 Service 而非 Model）
├── configRoutes.js       # LLM 配置（4 个端点）
└── uploadRoutes.js       # 文件上传（2 个端点，调用 Controller）
```

---

## 附录：server.js 挂载代码（当前 vs 建议）

### 当前（有问题）

```javascript
// server.js 第 39-60 行
const mapRoutes = require('./routes/mapRoutes');
const configRoutes = require('./routes/configRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const uploadRoutes = require('./routes/upload');
const blindMapNavigationRoutes = require('./routes/navigation');  // ← 废弃
const mapChunkRoutes = require('./routes/map');                    // ← 无人调用

app.use('/api/navigation', mapRoutes);
app.use('/api/config/llm', configRoutes);
app.use('/api/navigation', navigationRoutes);       // 同路径挂载
app.use('/api/upload', uploadRoutes);
app.use('/api/navigation', blindMapNavigationRoutes); // 同路径挂载（冲突！）
app.use('/api/map', mapChunkRoutes);
```

### 建议（清理后）

```javascript
const routes = require('./routes');  // 统一入口

app.use('/api/navigation', routes.navigation);
app.use('/api/config/llm', routes.config);
app.use('/api/upload', routes.upload);
// app.use('/api/map', routes.map);  // 如果确认无人使用，注释掉
```

---

> 文档结束。如需进一步分析某个具体路由的实现细节，或制定清理计划，请继续讨论。
