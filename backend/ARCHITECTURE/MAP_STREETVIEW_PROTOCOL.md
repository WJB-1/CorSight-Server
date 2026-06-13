# CorSight 地图服务与街景服务 — 完整架构与数据协议

> 本文档详细记录 CorSight 项目的地图服务、街景服务、数据结构和通信协议，供大规模重构参考。
> 最后更新：2026-06-12

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [后端地图服务](#2-后端地图服务)
   - 2.1 [高德地图 API 集成](#21-高德地图-api-集成)
   - 2.2 [路线预览流水线](#22-路线预览流水线)
   - 2.3 [IR 中间表示](#23-ir-中间表示)
   - 2.4 [空间查询服务](#24-空间查询服务)
3. [后端街景服务](#3-后端街景服务)
   - 3.1 [采样点数据模型](#31-采样点数据模型)
   - 3.2 [8 方向图片存储](#32-8-方向图片存储)
   - 3.3 [上传处理流程](#33-上传处理流程)
   - 3.4 [附近查询机制](#34-附近查询机制)
4. [Android 端地图服务](#4-android-端地图服务)
   - 4.1 [实时导航](#41-实时导航)
   - 4.2 [路线预览调用](#42-路线预览调用)
   - 4.3 [数据采集](#43-数据采集)
5. [Android 端街景服务](#5-android-端街景服务)
   - 5.1 [避障检测](#51-避障检测)
   - 5.2 [图像源](#52-图像源)
6. [通信协议](#6-通信协议)
   - 6.1 [HTTP API 端点](#61-http-api-端点)
   - 6.2 [Multipart 上传协议](#62-multipart-上传协议)
   - 6.3 [SSE 监控协议](#63-sse-监控协议)
   - 6.4 [云端检测协议](#64-云端检测协议)
7. [数据结构大全](#7-数据结构大全)
   - 7.1 [采样点 Schema](#71-采样点-schema)
   - 7.2 [IR 结构](#72-ir-结构)
   - 7.3 [感知数据](#73-感知数据)
   - 7.4 [Android CaptureTask](#74-android-capturetask)
   - 7.5 [导航播报响应](#75-导航播报响应)
8. [已知问题](#8-已知问题)

---

## 1. 整体架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Android 端                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Navigation  │  │ TripPreview │  │ DataCollect │  │   VisionTest        │  │
│  │ Manager     │  │ Service     │  │ Activity    │  │   Activity          │  │
│  │             │  │             │  │             │  │                     │  │
│  │ 高德SDK实时  │  │ 后端预览API │  │ 8方向采集   │  │  LOCAL/CLOUD避障   │  │
│  │ 导航+定位   │  │ 调用        │  │ +上传       │  │  + 语音告警         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                │                    │            │
│         │ 高德SDK         │ HTTP           │ HTTP multipart       │ HTTP       │
│         │ (本地)          │ (后端5741)     │ (后端5741)           │ (检测服务)  │
└─────────┼────────────────┼────────────────┼────────────────────┼────────────┘
          │                │                │                    │
          ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CorSight-Server 后端                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ amapService │  │ previewCtrl │  │   upload    │  │   corsightService   │  │
│  │             │  │             │  │   (路由)     │  │                     │  │
│  │ 高德Web API │  │ 预览流水线   │  │ 接收+存储   │  │  空间查询服务        │  │
│  │ 步行路线规划│  │ 编排        │  │ 8方向图片   │  │  (MongoDB $near)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                │                    │            │
│         ▼                ▼                ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MongoDB + 文件系统                           │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────────────────┐   │   │
│  │  │ sampling_points │  │  public/images/                        │   │   │
│  │  │ 集合            │  │  {point_id}_{N|NE|E|SE|S|SW|W|NW}.jpg  │   │   │
│  │  └─────────────────┘  └─────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 后端地图服务

### 2.1 高德地图 API 集成

**文件**：`backend/services/amapService.js`

**核心函数**：`getWalkingRoute(origin, destination)`（第 24 行）

```javascript
// 调用端点
GET https://restapi.amap.com/v3/direction/walking
  ?origin={originLng},{originLat}
  &destination={destLng},{destLat}
  &key={AMAP_WEB_KEY}

// 返回数据结构（pathData = response.data.route.paths[0]）
{
  distance: "700",        // 总距离（米）
  duration: "720",       // 预计时间（秒）
  steps: [               // 分段导航指令
    {
      instruction: "向东南步行100米上天桥",
      orientation: "东南",
      road: "东长安街",
      distance: "100",   // 本段距离
      action: "上天桥",
      assistant_action: "",
      walk_type: "4",     // 结构化类型标识
      polyline: "116.397,39.909;116.398,39.910"  // 经纬度序列
    }
  ],
  tolls: 0,
  toll_distance: 0,
  restriction: 0
}
```

**参数格式**：`origin` 和 `destination` 为 `"lng,lat"` 字符串，如 `"116.434307,39.90909"`。

**验证逻辑**（第 37-52 行）：
- 检查坐标格式是否为 `"lng,lat"`
- 检查经纬度数值范围
- 高德 API 返回 `status === '1'` 表示成功

---

### 2.2 路线预览流水线

**文件**：`backend/controllers/previewController.js`

**流水线 6 步**（第 119-181 行）：

```
Step 1: 高德路线规划
  input:  { origin: "lng,lat", destination: "lng,lat" }
  call:   amapService.getWalkingRoute(origin, destination)
  output: pathData (原始路线数据)

Step 2: 空间降噪（生成 IR）
  input:  pathData
  call:   spatialMiddleware.generateIntermediateRepresentation(pathData)
  output: irJson (中间表示)

Step 3: 视觉感知
  input:  irJson.key_nodes[]
  call:   perceptionAgent.enrichNodes(irJson.key_nodes)
  output: enriched_nodes[] (每个节点附加 perception_data)

Step 4: 全局分析
  input:  irJson (含 perception_data)
  call:   masterAgent.analyzeRouteGlobally(irJson)
  output: globalAnalysis (统计、配对、风险、冲突)

Step 5: 播报生成
  input:  irJson + globalAnalysis
  call:   languageOptimizerAgent.generateBroadcast(irJson)
  output: broadcastResult (语音播报文本)

Step 6: 组装响应
  output: { route_summary, key_nodes, broadcast_text, global_analysis, metadata }
```

---

### 2.3 IR 中间表示

**文件**：`backend/middleware/spatialMiddleware.js`

**生成逻辑**（第 324-416 行）：

1. **关键节点过滤**（`isKeyNode`，第 100-141 行）：
   - `walk_type` 在 `SPECIAL_WALK_TYPES` 中 → 保留
   - `action` 是转向/过马路 → 保留
   - `assistant_action` 是"到达目的地" → 保留
   - `instruction` 含关键词（天桥、地下通道等）→ 保留
   - 纯直行（`walk_type=0` + 直行 action）→ 跳过

2. **直路采样**（第 352 行）：
   - 纯直路段每 **200 米**插入一个 `sample` 节点

3. **航向计算**（`calculateHeadingFromPolyline`，第 166 行）：
   - 取 polyline 前两点计算方位角
   - 转换为 8 方向：`N/NE/E/SE/S/SW/W/NW`

4. **相对方向**（`createNode`，第 273-310 行）：
   - 比较当前节点与上一节点的航向差
   - 分类：直行 / 稍向左转 / 左转 / 向左后方转 / 掉头 / 向右后方转 / 右转 / 稍向右转

**IR 输出结构**：

```json
{
  "route_summary": {
    "total_distance": "700米",
    "duration_estimate": "12分钟",
    "original_steps_count": 15,
    "key_nodes_count": 5,
    "sample_nodes_count": 2,
    "total_nodes_count": 7,
    "compression_ratio": "53.3%"
  },
  "key_nodes": [
    {
      "node_index": 1,
      "node_type": "key",
      "distance_from_start": "100米",
      "action": "上天桥",
      "assistant_action": "",
      "instruction": "向东南步行100米上天桥",
      "road": "东长安街",
      "distance": "100米",
      "orientation": "东南",
      "heading": 135,
      "heading_direction": "SE",
      "relative_direction": "稍向左转",
      "walk_type": 4,
      "polyline": "116.397428,39.90923;116.397528,39.90933"
    }
  ],
  "raw_data": {
    "tolls": 0,
    "toll_distance": 0,
    "restriction": 0
  }
}
```

**walk_type 含义**（`spatialMiddleware.js` 第 43 行 + `sceneScoutPrompts.js` 第 147-165 行）：

| walk_type | 含义 | 场景类型 |
|-----------|------|---------|
| 0 | 普通道路 | path |
| 1 | 人行横道 | intersection |
| 3 | 地下通道 | underpass |
| 4 | 过街天桥 | overpass |
| 8 | 扶梯 | escalator |
| 9 | 直梯 | elevator |
| 12 | 建筑物穿越通道 | underpass |
| 13 | 行人通道 | underpass |
| 20 | 阶梯 | steps |
| 21 | 斜坡 | steps |
| 22 | 桥 | overpass |
| 23 | 隧道 | underpass |

---

### 2.4 空间查询服务

**文件**：`backend/services/corsightService.js`

**核心函数**：`getNearbyPoints(lat, lon, radius = 50)`（第 24 行）

```javascript
// 调用链
corsightService.getNearbyPoints(lat, lon, radius)
  → models/SamplingPoint.findNearbyPoints(lat, lon, radius)
    → MongoDB: db.sampling_points.find({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lon, lat] },
            $maxDistance: radius
          }
        }
      }).limit(20)
```

**返回格式**：

```json
[
  {
    "rank": 1,
    "point_id": "P_1780826776817_35872",
    "location": { "latitude": 23.040911, "longitude": 113.372083 },
    "scene_description": "天桥入口",
    "images": {
      "N": "/images/P_1780826776817_35872_N.jpg",
      "NE": "/images/P_1780826776817_35872_NE.jpg",
      ...
    },
    "distance_meters": 12
  }
]
```

**注意**：
- 使用 MongoDB `$near` + `2dsphere` 索引
- 默认半径 **50 米**，最大 20 条结果
- 图片 URL 由 `transformImageUrls()` 转换（第 87-113 行）

---

## 3. 后端街景服务

### 3.1 采样点数据模型

**文件**：`backend/models/SamplingPoint.js`

**Schema**（第 7-51 行）：

```javascript
{
  point_id: {              // 唯一标识符
    type: String,
    required: true,
    unique: true,
    index: true
  },
  location: {              // GeoJSON Point
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number]   // [longitude, latitude]
  },
  scene_description: {      // 场景描述
    type: String,
    default: ''
  },
  images: {                // 8 方向图片路径
    N: { type: String, default: null },
    NE: { type: String, default: null },
    E: { type: String, default: null },
    SE: { type: String, default: null },
    S: { type: String, default: null },
    SW: { type: String, default: null },
    W: { type: String, default: null },
    NW: { type: String, default: null }
  }
}
```

**索引**：`location: '2dsphere'`（第 54 行）— 支持地理空间查询。

**集合名**：`sampling_points`（与 Blind_map 项目共享）。

**时间戳**：`createdAt`, `updatedAt`（自动）。

---

### 3.2 8 方向图片存储

**存储位置**：`backend/public/images/`

**命名规则**：`{point_id}_{direction}.jpg`

示例：
```
P_1780826776817_35872_N.jpg
P_1780826776817_35872_NE.jpg
P_1780826776817_35872_E.jpg
...
P_1780826776817_35872_NW.jpg
```

**静态文件服务**（`server.js` 第 29 行）：
```javascript
app.use(express.static(path.join(__dirname, 'public')));
```

访问 URL：`http://server:5741/images/P_xxx_N.jpg`

**方向定义**（顺时针）：
```
    N (0°)
   /  \
 NW    NE (45°)
  |      |
 W ──┼── E (90°)
  |      |
 SW    SE (135°)
   \  /
    S (180°)
```

---

### 3.3 上传处理流程

**文件**：`backend/routes/upload.js`

**上传协议**：`multipart/form-data`

**阶段 1：临时保存**（第 26-35 行）：
```javascript
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, `tmp_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});
```

**阶段 2：解析 + 重命名**（第 86-246 行）：
1. 提取 `jsonData` 字段（JSON 字符串）
2. 解析坐标（支持 DMS 格式转换）
3. 重命名图片：`{point_id}_{direction}.jpg`
4. 覆盖旧文件（如果存在）
5. 构建数据库文档
6. 调用 `saveSamplingPoint()` 存入 MongoDB

**错误处理**：上传失败时清理所有临时文件（`cleanupFiles`，第 251-262 行）。

**单张补传**（第 313-369 行）：
- 端点：`POST /api/upload/image`
- 字段：`point_id` + `image_{direction}`
- 更新数据库中对应方向的图片路径

---

### 3.4 附近查询机制

**文件**：`backend/models/SamplingPoint.js`（第 65-77 行）

```javascript
async function findNearbyPoints(lat, lon, radius = 50) {
  return SamplingPoint.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lon, lat]   // GeoJSON 顺序：[经度, 纬度]
        },
        $maxDistance: radius        // 单位：米
      }
    }
  }).limit(20).lean();             // 最多 20 条，lean 模式（返回纯 JSON）
}
```

**注意**：
- GeoJSON 坐标顺序是 `[longitude, latitude]`，与常见 `[lat, lng]` 不同
- `$near` 返回结果已按距离排序（最近在前）
- `2dsphere` 索引支持球面距离计算

---

## 4. Android 端地图服务

### 4.1 实时导航

**文件**：`app/src/main/java/com/example/voicenavigation/navigation/NavigationManager.java`

**核心组件**：
- `AMapLocationClient` — 实时定位（3 秒更新间隔）
- `RouteSearch` — 步行路线规划
- `WalkRouteResult` / `WalkPath` — 路线数据

**路线规划**（第 230-256 行）：
```java
public void planRoute(LatLng origin, LatLng dest, String destName) {
    LatLonPoint from = new LatLonPoint(origin.latitude, origin.longitude);
    LatLonPoint to = new LatLonPoint(dest.latitude, dest.longitude);
    RouteSearch.FromAndTo fromAndTo = new RouteSearch.FromAndTo(from, to);
    RouteSearch.WalkRouteQuery query = new RouteSearch.WalkRouteQuery(fromAndTo, RouteSearch.WalkDefault);
    routeSearch.calculateWalkRouteAsyn(query);  // 异步调用
}
```

**导航进度跟踪**（第 154-215 行）：
- 每 3 秒更新位置
- 计算距离路线最近点
- 偏离路线超过 **50 米** → 自动重新规划
- 距离目的地 **20 米** 内 → 触发到达回调

**回调接口**（第 50-63 行）：
```java
public interface NavigationCallback {
    void onLocationUpdated(Location location, String address);
    void onRouteReady(List<LatLng> routePoints, float totalDistance, float totalDuration, List<String> instructions);
    void onNavigationInfoUpdated(float remainingDistance, float remainingDuration, String nextInstruction);
    void onReRouting();           // 偏离路线，重新规划
    void onArrived();             // 到达目的地
    void onNavigationStarted();
    void onNavigationStopped();
    void onNavigationError(String error);
}
```

---

### 4.2 路线预览调用

**文件**：`app/src/main/java/com/example/voicenavigation/network/TripPreviewService.java`

**默认后端地址**：`http://114.132.86.138:5000`（第 58 行）

**标准预览请求**（第 99-144 行）：
```java
public void sendPreviewRequest(double originLat, double originLng,
                                double destLat, double destLng,
                                @NonNull PreviewCallback previewCallback) {
    String url = baseUrl + "/api/navigation/preview";
    
    JSONObject requestBody = new JSONObject();
    requestBody.put("origin", originLng + "," + originLat);      // "lng,lat" 格式
    requestBody.put("destination", destLng + "," + destLat);
    
    // POST application/json
}
```

**固定路线预览**（第 152-196 行）：
```java
public void sendFixedPreviewRequest(@NonNull String routeId,
                                     @NonNull PreviewCallback previewCallback) {
    String url = baseUrl + "/api/navigation/preview/fixed/" + routeId;
    
    JSONObject options = new JSONObject();
    options.put("enable_perception", true);
    options.put("enable_broadcast", true);
    requestBody.put("options", options);
}
```

**回调**：
```java
public interface PreviewCallback {
    void onSuccess(String response);  // 原始 JSON 字符串
    void onError(String error);
}
```

---

### 4.3 数据采集

**文件**：`app/src/main/java/com/example/voicenavigation/collection/DataCollectionActivity.kt`

**采集流程**：
1. 初始化指南针和定位服务
2. 用户将手机对准目标方向（N, NE, E, SE, S, SW, W, NW）
3. 调用系统相机拍照
4. 重复 8 次，覆盖所有方向
5. 预览对话框显示 8 张缩略图
6. 输入场景描述
7. 保存为 `CaptureTask`
8. 通过 `UploadService` 上传到后端

**CaptureTask 结构**（`CaptureTask.kt`）：
```kotlin
data class CaptureTask(
    val pointId: String,           // "P_${timestamp}_${random}"
    val chunkId: String,           // 网格区块 ID（本地组织用）
    val latitude: Double,
    val longitude: Double,
    val sceneDescription: String,
    val images: MutableMap<String, String> = mutableMapOf(),  // 方向 -> 本地文件路径
    var status: String = "pending",  // pending / success / failed
    val createdAt: String,
    var updatedAt: String,
    var uploadedAt: String? = null
)
```

---

## 5. Android 端街景服务

### 5.1 避障检测

**文件**：`app/src/main/java/com/example/voicenavigation/VisionTestActivity.kt`

**两种检测模式**：

| 模式 | 处理位置 | 模型 | 延迟 |
|------|---------|------|------|
| **LOCAL** | 手机本地 | YOLOv8 ONNX | ~120ms/帧 |
| **CLOUD** | 远程服务器 | 服务器端模型 | 网络延迟 |

**LOCAL 模式流程**（第 403-431 行）：
1. `CameraSource` 通过 CameraX 获取帧
2. `ImageQualityAnalyzer.assess()` 检查画面清晰度
3. `ToolRegistry.activeTool.process()` 运行 YOLOv8 推理
4. `ObstacleRiskAnalyzer.analyze()` 计算风险区域重叠
5. `ObstacleAlertTracker` 跟踪跨帧障碍物，防止重复告警
6. `BaiduTtsManager` 语音播报障碍物信息

**CLOUD 模式流程**（第 433-506 行）：
1. 同样获取帧
2. 压缩为 JPEG（质量 80）
3. HTTP POST 到检测服务器 `{server_url}/api/detect`
4. 解析返回的检测框（支持多种 JSON 格式）
5. 同样的风险分析和语音告警

**检测框格式支持**（`parseCloudDetections`，第 629-651 行）：
```json
// 格式 1
{"detections": [{"box": [x1,y1,x2,y2], "score": 0.95, "label": "person"}]}

// 格式 2
{"data": {"detections": [...]}}

// 格式 3
{"items": [{"bbox": [x1,y1,x2,y2], "confidence": 0.95, "class_name": "person"}]}
```

**时序稳定**（第 573-593 行）：
- 保存最近 5 帧检测结果
- IoU ≥ 0.35 认为是同一目标
- 合并检测框取平均，减少抖动

---

### 5.2 图像源

**CameraSource**（`CameraSource.kt`）：
- CameraX API
- 后置摄像头
- `Preview`（取景器）+ `ImageAnalysis`（帧处理）
- 帧回调：`(Bitmap, rotationDegrees)`，rotation 为 0/90/180/270
- `STRATEGY_KEEP_ONLY_LATEST` — 丢弃积压帧

**NetworkSource**（`NetworkSource.kt`）：
- TCP Socket 连接外部设备（如 ESP32-CAM）
- 协议：发送 "start" 开始，"stop" 结束
- 接收：4 字节长度前缀 + JPEG 数据
- 帧回调：`(Bitmap, 0)` — 网络源无旋转信息

**UDP 自动发现**（`VisionTestActivity.kt` 第 227-306 行）：
- 监听端口 8888
- 接收广播消息，提取 `IP=xxx.xxx.xxx.xxx`
- 超时 5 秒，未找到则退回本地相机

---

## 6. 通信协议

### 6.1 HTTP API 端点

| 端点 | 方法 | 请求 | 响应 | 调用方 |
|------|------|------|------|--------|
| `/api/navigation/preview` | POST | `{"origin":"lng,lat","destination":"lng,lat"}` | `{"success":true,"data":{"text":"...","ir":{...}}}` | Android `TripPreviewService` |
| `/api/navigation/preview/fixed/{routeId}` | POST | `{"options":{"enable_perception":true}}` | 同上 + `fixed_route` | Android `TripPreviewService` |
| `/api/navigation/preview/test` | GET | 无 | 完整预览响应 | 前端调试用 |
| `/api/navigation/preview/health` | GET | 无 | `{"status":"healthy"}` | 监控 |
| `/api/navigation/nearby` | GET | `?lat={lat}&lon={lon}&radius={radius}` | `{"success":true,"data":{"points":[...]}}` | Android / 前端 / `perceptionAgent` |
| `/api/navigation/point/{pointId}` | GET | 无 | `{"success":true,"data":{...}}` | 前端 |
| `/api/navigation/points` | GET | 无 | `{"success":true,"data":{"points":[...]}}` | 前端 Dashboard |
| `/api/navigation/stats` | GET | 无 | `{"success":true,"data":{"total_points":N}}` | 前端 Dashboard |
| `/api/upload/sampling_point` | POST | multipart: `jsonData` + 8 images | `{"success":true,"data":{"point_id":"...","images":{...}}}` | Android `UploadService` |
| `/api/upload/image` | POST | multipart: `point_id` + `image_{dir}` | `{"success":true,"data":{"direction":"N","path":"..."}}` | Android `UploadService` |
| `/api/map/chunk` | GET | `?bbox=minLon,minLat,maxLon,maxLat` | `{"success":true,"data":{"geojson":{...}}}` | 无人调用 |
| `/api/monitor/stream` | GET | 无 | `text/event-stream` | 前端 Monitor |
| `/health` | GET | 无 | `{"status":"ok"}` | 监控 |

---

### 6.2 Multipart 上传协议

**主上传**：`POST /api/upload/sampling_point`

**Form 字段**：

| 字段名 | 类型 | 内容 |
|--------|------|------|
| `jsonData` | text | JSON 字符串，包含 `point_id`、`coordinates`、`scene_description` |
| `image_N` | file | 北方向 JPEG 图片 |
| `image_NE` | file | 东北方向 JPEG 图片 |
| `image_E` | file | 东方向 JPEG 图片 |
| `image_SE` | file | 东南方向 JPEG 图片 |
| `image_S` | file | 南方向 JPEG 图片 |
| `image_SW` | file | 西南方向 JPEG 图片 |
| `image_W` | file | 西方向 JPEG 图片 |
| `image_NW` | file | 西北方向 JPEG 图片 |

**jsonData 格式**：
```json
{
  "point_id": "P_1780826776817_35872",
  "coordinates": {
    "longitude": 113.372083,
    "latitude": 23.040911
  },
  "scene_description": "天桥入口"
}
```

**后端响应**：
```json
{
  "success": true,
  "message": "采样点上传成功",
  "data": {
    "point_id": "P_1780826776817_35872",
    "location": {
      "type": "Point",
      "coordinates": [113.372083, 23.040911]
    },
    "scene_description": "天桥入口",
    "images": {
      "N": "/public/images/P_1780826776817_35872_N.jpg",
      "NE": "/public/images/P_1780826776817_35872_NE.jpg",
      ...
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**单张补传**：`POST /api/upload/image`

| 字段名 | 类型 | 内容 |
|--------|------|------|
| `point_id` | text | 已有采样点 ID |
| `image_{direction}` | file | 单张 JPEG 图片（如 `image_N`） |

---

### 6.3 SSE 监控协议

**端点**：`GET /api/monitor/stream`

**响应头**：
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**消息格式**：
```
data: {"type":"request","data":{"timestamp":"2024-01-01T00:00:00.000Z","method":"POST","url":"/api/navigation/preview","statusCode":200,"duration":1234,"requestBody":{...},"responseBody":{...}}}

```

**后端实现**（`requestMonitor.js`）：
- Monkey-patch `res.write` 和 `res.end`
- 拦截所有 HTTP 请求/响应
- 记录请求体（截断至 500 字符）和响应体（截断至 2000 字符）
- 广播到所有 SSE 客户端
- 跳过 `/api/monitor/stream` 和 `/public/` 路径

---

### 6.4 云端检测协议

**端点**：`POST {detection_server_url}/api/detect`

**注意**：这是**独立服务**，不是 CorSight-Server 的一部分。

**请求**（`VisionTestActivity.kt` 第 466-472 行）：
```kotlin
val body = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("image", "frame.jpg", imageBody)           // JPEG 字节
    .addFormDataPart("rotation", rotationDegrees.toString())     // 0/90/180/270
    .addFormDataPart("sharpness", quality.sharpness.toString())  // 清晰度分数
    .build()
```

**响应格式**（支持多种，第 629-637 行）：
```json
// 格式 1
{"detections": [{"box": [x1,y1,x2,y2], "score": 0.95, "label": "person", "class_id": 1}]}

// 格式 2
{"data": {"detections": [{"box": [...], "score": 0.95, "label": "person"}]}}

// 格式 3
{"items": [{"bbox": [x1,y1,x2,y2], "confidence": 0.95, "class_name": "person", "classId": 1}]}
```

**检测框格式**（多种支持，第 654-674 行）：
- 数组：`[x1, y1, x2, y2]`
- 对象：`{"x1":0.1, "y1":0.2, "x2":0.3, "y2":0.4}`
- 对象：`{"left":0.1, "top":0.2, "right":0.3, "bottom":0.4}`
- 带宽高：`{"x":0.1, "y":0.2, "width":0.2, "height":0.2}`

---

## 7. 数据结构大全

### 7.1 采样点 Schema

```javascript
{
  "point_id": "P_1780826776817_35872",      // 唯一标识
  "location": {
    "type": "Point",
    "coordinates": [113.372083, 23.040911]   // [经度, 纬度]
  },
  "scene_description": "天桥入口",
  "images": {
    "N": "/public/images/P_1780826776817_35872_N.jpg",
    "NE": "/public/images/P_1780826776817_35872_NE.jpg",
    "E": "/public/images/P_1780826776817_35872_E.jpg",
    "SE": "/public/images/P_1780826776817_35872_SE.jpg",
    "S": "/public/images/P_1780826776817_35872_S.jpg",
    "SW": "/public/images/P_1780826776817_35872_SW.jpg",
    "W": "/public/images/P_1780826776817_35872_W.jpg",
    "NW": "/public/images/P_1780826776817_35872_NW.jpg"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

### 7.2 IR 结构

```javascript
{
  "route_summary": {
    "total_distance": "700米",
    "duration_estimate": "12分钟",
    "original_steps_count": 15,
    "key_nodes_count": 5,
    "sample_nodes_count": 2,
    "total_nodes_count": 7,
    "compression_ratio": "53.3%"
  },
  "key_nodes": [
    {
      "node_index": 1,
      "node_type": "key",              // "key" | "sample"
      "distance_from_start": "100米",
      "action": "上天桥",
      "assistant_action": "",
      "instruction": "向东南步行100米上天桥",
      "road": "东长安街",
      "distance": "100米",
      "orientation": "东南",
      "heading": 135,                   // 0-360°
      "heading_direction": "SE",        // N/NE/E/SE/S/SW/W/NW
      "relative_direction": "稍向左转",  // 相对于上一节点
      "walk_type": 4,                   // 高德结构化类型
      "polyline": "116.397,39.909;116.398,39.910"
    }
  ],
  "raw_data": {
    "tolls": 0,
    "toll_distance": 0,
    "restriction": 0
  }
}
```

---

### 7.3 感知数据

```javascript
{
  "perception_data": {
    "point_id": "P_1780826776817_35872",
    "point_distance": 8,               // 采样点距离节点多远（米）
    "scene_description": "天桥入口",
    "analysis": {
      "parsed": {
        "hazards": ["两段连续向上台阶"],
        "accessibility_analysis": {
          "tactile_paving": "无盲道铺设",
          "audible_signals": "无过街提示音"
        },
        "sidewalk": {
          "width": "2米",
          "surface": "平整",
          "obstacles": ["共享单车"]
        },
        "guidance": {
          "tactile_cues": "右侧有栏杆",
          "auditory_cues": "车流声从左侧传来"
        }
      },
      "raw_response": "AI 原始 Markdown 输出",
      "image_paths": ["/images/P_xxx_N.jpg", "/images/P_xxx_NE.jpg", "/images/P_xxx_NW.jpg"]
    },
    "prompt_type": "overpass",         // path | intersection | overpass | underpass | steps | elevator | escalator
    "image_count": 3,
    "facing_direction": "SE"
  }
}
```

---

### 7.4 Android CaptureTask

```kotlin
data class CaptureTask(
    val pointId: String,           // "P_${System.currentTimeMillis()}_${random}"
    val chunkId: String,           // 网格区块 ID（本地组织用，不上传）
    val latitude: Double,        // WGS-84 纬度
    val longitude: Double,       // WGS-84 经度
    val sceneDescription: String, // 用户输入的场景描述
    val images: MutableMap<String, String> = mutableMapOf(),  // "N" -> "/storage/.../IMG_001.jpg"
    var status: String = "pending",  // pending / success / failed
    val createdAt: String = "2024-01-01T00:00:00.000Z",
    var updatedAt: String = createdAt,
    var uploadedAt: String? = null
)
```

---

### 7.5 导航播报响应

```javascript
{
  "success": true,
  "data": {
    "route_summary": {
      "total_distance": "700米",
      "duration_estimate": "12分钟",
      "key_nodes_count": 5,
      "sample_nodes_count": 2
    },
    "key_nodes": [
      {
        "node_index": 1,
        "node_type": "key",
        "action": "上天桥",
        "instruction": "向东南步行100米上天桥",
        "heading_direction": "SE",
        "perception_data": { ... }
      }
    ],
    "text": "全程约700米，预计12分钟。起点向东南步行100米上天桥...",
    "metadata": {
      "pipeline_version": "Phase 4",
      "steps_completed": ["amap_routing", "spatial_filtering", "perception_enrichment", "broadcast_generation"],
      "broadcast": {
        "validation": { "passed": true },
        "provider": "gemini"
      }
    }
  }
}
```

---

## 8. 已知问题

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | **坐标顺序混乱** | 多处 | GeoJSON 用 `[lon,lat]`，高德 API 用 `"lng,lat"`，Android 内部用 `LatLng(lat,lng)`，容易混淆 |
| 2 | **50m 搜索半径过大** | `perceptionAgent.js` 第 68 行 | 密集区域多个节点匹配到同一点 |
| 3 | **只取最近点** | `perceptionAgent.js` 第 81 行 | `nearbyPoints[0]` 无质量评估 |
| 4 | **polyline 中点近似** | `perceptionAgent.js` 第 172 行 | 节点坐标是 polyline 中点，不是实际节点位置 |
| 5 | **无网格化** | 全局 | 坐标精度问题导致相邻点匹配混乱 |
| 6 | **navigation.js 路由冲突** | `server.js` 第 59 行 | `navigation.js` 永远不会被匹配到 |
| 7 | **map.js 无人调用** | `server.js` 第 60 行 | OSM 功能预留但无用 |
| 8 | **configRoutes 端点过多** | `configRoutes.js` | 10 个端点，6 个冗余 |
| 9 | **upload.js 无 Controller** | `upload.js` | 200+ 行业务逻辑直接写在路由里 |
| 10 | **mapRoutes 直接调 Model** | `mapRoutes.js` 第 152 行 | `stats` 端点跳过 Service 层 |

---

> 文档结束。如需进一步分析某个具体模块的实现细节，或制定重构方案，请继续讨论。