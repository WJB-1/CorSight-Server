# Blind_map 项目接口契约文档

> 本文档汇总 `Blind_map`（视障语义地图后端服务-模块五及配套前端）的对外 HTTP API、前后端数据交换格式，以及前端内部服务层调用契约。
> 文档基于源码（`backend/routes/*.js`、`backend/models/*.js`、`frontend/src/services/*.ts`）自动生成/整理。

---

## 目录

1. [全局约定](#1-全局约定)
2. [后端 HTTP API](#2-后端-http-api)
   - 2.1 [获取 OSM 行人地图数据](#21-get-apimapchunk)
   - 2.2 [上传采样点（图片+JSON）](#22-post-apiuploadsampling_point)
   - 2.3 [附近采样点查询](#23-get-apinavigationnearby)
   - 2.4 [健康检查](#24-get-health)
3. [数据模型与 Schema](#3-数据模型与-schema)
   - 3.1 [MongoDB 采样点文档（后端）](#31-mongodb-采样点文档后端)
   - 3.2 [前端 TypeScript 类型定义](#32-前端-typescript-类型定义)
4. [前端服务层内部接口](#4-前端服务层内部接口)
   - 4.1 [MapService（地图数据加载）](#41-mapservice)
   - 4.2 [SyncService（端云同步）](#42-syncservice)
   - 4.3 [StorageService（离线队列）](#43-storageservice)
   - 4.4 [DataAssembler（数据组装）](#44-dataassembler)
   - 4.5 [GridManager（空间网格）](#45-gridmanager)
5. [前后端兼容性说明](#5-前后端兼容性说明)

---

## 1. 全局约定

| 项 | 约定 |
|---|---|
| **基础 URL** | 后端默认监听 `http://localhost:3001`；前端服务层默认指向 `http://localhost:3000/api`（`mapService.ts`）或 `http://localhost:3000`（`syncService.ts`） |
| **坐标系** | WGS-84；GeoJSON 坐标顺序为 `[经度, 纬度]` |
| **经纬度输入** | 后端支持十进制浮点数或度分秒（DMS）字符串，如 `"23°8'11''"`，内部会自动转换为十进制 |
| **通用响应信封** | 成功：`{ success: true, data: {...} }`；失败：`{ success: false, message: "...", error?: "..." }` |
| **图片方位** | 固定 8 个方向：`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW` |
| **图片存储** | 后端接收后重命名为 `{point_id}_{方向}.jpg`，存放于 `backend/public/images/` |
| **静态资源访问** | 通过根路径直接访问，如 `/images/P001_N.jpg` |

---

## 2. 后端 HTTP API

### 2.1 GET `/api/map/chunk`

**功能**：Overpass Proxy，查询指定边界框内的 OSM 行人相关数据并返回精简 GeoJSON。

#### Request

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bbox` | `string` | 是 | 边界框，格式：`minLon,minLat,maxLon,maxLat` |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "bbox": {
      "minLon": 113.32,
      "minLat": 23.13,
      "maxLon": 113.33,
      "maxLat": 23.14
    },
    "query_info": {
      "overpass_url": "https://overpass-api.de/api/interpreter",
      "filters": ["highway=pedestrian", "highway=footway", "highway=steps", "highway=crossing"]
    },
    "geojson": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "LineString",
            "coordinates": [[113.321, 23.131], [113.322, 23.132]]
          },
          "properties": {
            "osm_id": 123456,
            "osm_type": "way",
            "highway": "footway"
          }
        }
      ]
    },
    "element_count": 42
  }
}
```

#### 错误码

| 状态码 | 场景 |
|---|---|
| `400` | 缺少 `bbox`、格式错误、坐标越界、查询范围过大（> 1°×1°） |
| `502` | Overpass API 返回错误 |
| `504` | Overpass API 请求超时 |
| `500` | 服务器内部错误 |

---

### 2.2 POST `/api/upload/sampling_point`

**功能**：Data Receiver，接收 multipart/form-data 混合包（8 张环视图片 + 1 个 JSON 描述），写入 MongoDB。

#### Request

- **Content-Type**: `multipart/form-data`
- **字段**：

| 字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `jsonData` | `string` (JSON) | 是 | 采样点 JSON 字符串，见下方结构 |
| `image_N` | `file` | 否 | 北向图片（`image/jpeg` 或 `image/png`） |
| `image_NE` | `file` | 否 | 东北向图片 |
| `image_E` | `file` | 否 | 东向图片 |
| `image_SE` | `file` | 否 | 东南向图片 |
| `image_S` | `file` | 否 | 南向图片 |
| `image_SW` | `file` | 否 | 西南向图片 |
| `image_W` | `file` | 否 | 西向图片 |
| `image_NW` | `file` | 否 | 西北向图片 |

#### `jsonData` 结构示例

```json
{
  "point_id": "P001",
  "coordinates": {
    "longitude": "113°19'20''",
    "latitude": "23°8'11''"
  },
  "scene_description": "十字路口，有红绿灯和人行横道",
  "images": {
    "N": "_doc/uniapp_temp/compressed/photo_N.jpg"
  }
}
```

> 说明：
> - `coordinates.longitude` / `coordinates.latitude` 支持 DMS 字符串或十进制数字。
> - `images` 中若某方向已有路径（如云端 URL），但表单中未上传对应图片文件，则保留原值。

#### Response (201 Created)

```json
{
  "success": true,
  "message": "采样点上传成功",
  "data": {
    "point_id": "P001",
    "location": {
      "type": "Point",
      "coordinates": [113.3222, 23.1364]
    },
    "scene_description": "十字路口，有红绿灯和人行横道",
    "images": {
      "N": "/public/images/P001_N.jpg",
      "NE": "/public/images/P001_NE.jpg"
    },
    "image_mappings": {
      "N": {
        "originalName": "photo_N.jpg",
        "savedPath": "/public/images/P001_N.jpg",
        "size": 204800
      }
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 限制

| 项 | 限制 |
|---|---|
| 单文件大小 | ≤ 22 MB |
| 文件数量 | ≤ 8 张 |
| 允许格式 | `image/jpeg`, `image/jpg`, `image/png` |

#### 错误码

| 状态码 | 场景 |
|---|---|
| `400` | JSON 解析失败、缺少 `point_id` / `coordinates`、经纬度转换失败、文件超限 |
| `500` | 服务器内部错误（出错时会自动清理已上传的物理文件） |

---

### 2.3 GET `/api/navigation/nearby`

**功能**：Radius Search Engine，基于 MongoDB `$nearSphere` 查询指定位置附近的采样点，按距离由近到远排序。

#### Request

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `lat` | `number` | 是 | 纬度（-90 ~ 90） |
| `lon` | `number` | 是 | 经度（-180 ~ 180） |
| `radius` | `number` | 否 | 搜索半径（米），默认 `50`，范围 `1 ~ 10000` |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "query": {
      "center": {
        "latitude": 23.1364,
        "longitude": 113.3223
      },
      "radius_meters": 50
    },
    "total_count": 3,
    "points": [
      {
        "rank": 1,
        "point_id": "P001",
        "location": {
          "latitude": 23.1365,
          "longitude": 113.3224
        },
        "scene_description": "十字路口，有红绿灯和人行横道",
        "images": {
          "N": "/public/images/P001_N.jpg"
        },
        "distance_meters": 15,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### 错误码

| 状态码 | 场景 |
|---|---|
| `400` | 缺少 `lat` / `lon`、坐标格式无效、半径越界 |
| `500` | 服务器内部错误 |

---

### 2.4 GET `/health`

**功能**：服务健康检查。

#### Response (200 OK)

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "blind-map-backend",
  "version": "1.0.0"
}
```

---

## 3. 数据模型与 Schema

### 3.1 MongoDB 采样点文档（后端）

集合名：`sampling_points`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `point_id` | `String` | 必填、唯一、索引 | 采样点唯一标识 |
| `location` | `GeoJSON Point` | 必填 | 坐标顺序 `[经度, 纬度]` |
| `scene_description` | `String` | 默认 `""` | 场景文字描述 |
| `images` | `Object` | 默认 `null` | 八方位图片路径映射 |
| `createdAt` | `Date` | 自动 | 创建时间 |
| `updatedAt` | `Date` | 自动 | 更新时间 |

#### `location` 结构

```json
{
  "type": "Point",
  "coordinates": [113.3223, 23.1364]
}
```

> **重要**：已创建 `2dsphere` 索引，支撑地理空间查询。

#### `images` 结构

```json
{
  "N": "/public/images/P001_N.jpg",
  "NE": null,
  "E": "/public/images/P001_E.jpg",
  "SE": null,
  "S": null,
  "SW": null,
  "W": null,
  "NW": null
}
```

---

### 3.2 前端 TypeScript 类型定义

文件：`frontend/src/types/map.d.ts`

#### `SamplingPoint`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `point_id` | `string` | 是 | 格式：`Point_<timestamp>_<random>` |
| `coordinates` | `Coordinates` | 是 | `{ longitude: number; latitude: number }` |
| `scene_description` | `string` | 否 | 场景描述 |
| `images` | `DirectionImages` | 是 | 本地路径或云端 URL |
| `status` | `SamplingPointStatus` | 是 | `'pending' \| 'uploading' \| 'synced'` |
| `timestamp` | `number` | 是 | Unix 毫秒时间戳 |

#### `DirectionImages`

键为 `N | NE | E | SE | S | SW | W | NW`，值为路径字符串或 `undefined`。

#### `SyncTaskResult`

| 字段 | 类型 | 说明 |
|---|---|---|
| `point_id` | `string` | 采样点 ID |
| `success` | `boolean` | 整体是否成功 |
| `imageResults` | `ImageUploadResult[]` | 各方向图片上传结果 |
| `serverResponse` | `any` | 后端响应数据 |
| `error` | `string` | 错误信息 |

---

## 4. 前端服务层内部接口

### 4.1 MapService

单例，文件：`frontend/src/services/mapService.ts`

| 方法 | 签名 | 说明 |
|---|---|---|
| `fetchMapDataByLocation` | `(lat, lon) => Promise<any \| null>` | 根据位置拉取 OSM GeoJSON；若 chunk 已缓存则返回 `null` |
| `preloadSurroundingChunks` | `(lat, lon) => Promise<void>` | 预加载九宫格（当前区块 + 周围 8 个） |
| `checkAndLoadOnBoundaryCross` | `(prevLat, prevLon, currLat, currLon) => Promise<boolean>` | 检查是否跨越瓦片边界，若跨越则自动加载新区块 |
| `refreshChunk` | `(lat, lon) => Promise<any>` | 强制刷新指定区块，无视缓存 |
| `clearCache` | `() => void` | 清空已加载 chunk 缓存 |
| `getLoadedChunkCount` | `() => number` | 获取已缓存区块数 |
| `isChunkLoaded` | `(chunkId) => boolean` | 判断指定区块是否已加载 |

#### 内部请求格式

```typescript
GET ${API_BASE_URL}/map/chunk?bbox=${encodeURIComponent(bboxString)}
```

---

### 4.2 SyncService

单例，文件：`frontend/src/services/syncService.ts`

| 方法 | 签名 | 说明 |
|---|---|---|
| `syncPendingTasks` | `() => Promise<SyncTaskResult[]>` | 核心入口：串行同步所有 `pending` 任务到云端 |
| `getIsSyncing` | `() => boolean` | 检查是否正在同步 |
| `setMaxConcurrentUploads` | `(max: number) => void` | 设置最大并发上传数（默认 3，范围 1~8） |
| `retryFailedImages` | `(point_id, directions[]) => Promise<ImageUploadResult[]>` | 手动重试指定方向的图片上传 |

#### 同步流程

1. 从 `StorageService` 获取所有 `pending` 任务。
2. 对每个任务：并发上传 8 张图片（`uni.uploadFile`）。
3. 全部成功后，将本地路径替换为云端 URL。
4. 发送完整 JSON 到后端 `/api/upload/sampling_point`。
5. 后端返回成功后，执行垃圾回收：删除本地记录和物理文件。
6. 任一环节失败，回滚任务状态为 `pending`，等待下次重试。

---

### 4.3 StorageService

单例，文件：`frontend/src/services/storageService.ts`

| 方法 | 签名 | 说明 |
|---|---|---|
| `addTask` | `(point: SamplingPoint) => void` | 添加/更新任务到本地离线队列（`uni.setStorageSync`） |
| `getPendingTasks` | `() => SamplingPoint[]` | 获取所有 `status === 'pending'` 的任务 |
| `getUploadingTasks` | `() => SamplingPoint[]` | 获取所有 `status === 'uploading'` 的任务 |
| `getSyncedTasks` | `() => SamplingPoint[]` | 获取所有 `status === 'synced'` 的任务 |
| `getAllTasks` | `() => SamplingPoint[]` | 获取全部任务 |
| `removeTask` | `(point_id) => void` | 移除指定任务 |
| `updateTaskStatus` | `(point_id, status, extraData?) => void` | 更新任务状态及附加字段 |
| `getTaskById` | `(point_id) => SamplingPoint \| undefined` | 按 ID 获取单个任务 |
| `clearAllTasks` | `() => void` | 清空所有本地任务 |
| `getStats` | `() => { total, pending, uploading, synced }` | 获取队列统计 |

---

### 4.4 DataAssembler

工具函数集，文件：`frontend/src/utils/dataAssembler.ts`

| 方法 | 签名 | 说明 |
|---|---|---|
| `createSamplingPoint` | `(lat, lon, desc, localImages) => string` | 组装 `SamplingPoint` 并存入本地队列，返回 `point_id` |
| `createSamplingPoints` | `(points[]) => string[]` | 批量创建采样点 |
| `updateSamplingPointDescription` | `(point_id, newDesc) => void` | 更新指定任务的场景描述 |
| `getSamplingStats` | `() => object` | 快捷获取队列统计 |
| `generatePointId` | `() => string` | 生成 `Point_<timestamp>_<random>` 格式 ID |
| `processLocalImages` | `(localImages) => DirectionImages` | 过滤无效本地路径，仅保留有效八方位图片 |

---

### 4.5 GridManager

空间网格工具集，文件：`frontend/src/utils/gridManager.ts`

| 方法 | 签名 | 说明 |
|---|---|---|
| `getTile` | `(lat, lon, zoom=16) => { x, y, z, chunkId }` | 计算瓦片坐标，默认 Zoom 16（约 500m×500m） |
| `getTileBoundingBox` | `(x, y, z) => [minLon, minLat, maxLon, maxLat]` | 反向计算瓦片真实地理边界 |
| `getCurrentAndSurroundingChunks` | `(lat, lon, zoom=16) => string[]` | 获取九宫格 `chunkId` 列表 |
| `parseChunkId` | `(chunkId) => { x, y, z } \| null` | 解析 `chunkId`（格式：`{z}_{x}_{y}`） |
| `calculateDistance` | `(lat1, lon1, lat2, lon2) => number` | Haversine 公式计算两点距离（米） |
| `hasCrossedTileBoundary` | `(lat1, lon1, lat2, lon2, zoom=16) => boolean` | 检查是否跨越瓦片边界 |
| `dmsToDecimal` | `(dms) => number` | 度分秒转十进制度数 |

---

## 5. 前后端兼容性说明

### 5.1 单张图片上传端点差异

- **前端 `SyncService`** 中定义了单张图片上传路径 `IMAGE_UPLOAD_ENDPOINT = '/api/upload/image'`，并在 `uploadSingleImage` 中使用 `uni.uploadFile` 调用。
- **后端 `upload.js`** 中仅实现了 `/api/upload/sampling_point`，该接口在一次请求中同时接收图片和 `jsonData`。
- **结论**：当前代码中，`syncService.ts` 的 `uploadSingleImage` 调用的是**未实现**的后端端点。实际部署时，需确保后端补充 `/api/upload/image`，或调整前端同步策略，改为直接调用 `/api/upload/sampling_point`（multipart 上传所有图片 + JSON）。

### 5.2 JSON 上传方式差异

- **前端 `uploadSamplingPointData`** 使用 `uni.request` 发送 `application/json` POST 请求到 `/api/upload/sampling_point`。
- **后端 `/api/upload/sampling_point`** 使用 `multer` 解析 `multipart/form-data`，期望通过 `jsonData` 字段或图片文件字段接收数据。
- **结论**：直接发送纯 JSON 无法被当前后端路由正确接收。生产环境中，前端应将采样点数据包装为 `FormData`（含 `jsonData` 字段 + 图片文件），统一走 multipart 上传。

### 5.3 坐标顺序一致性

- 前端 `SamplingPoint.coordinates` 使用 `{ longitude, latitude }`（先经后纬）。
- 后端 MongoDB GeoJSON `location.coordinates` 同样使用 `[经度, 纬度]`。
- 前后端数据交换时需确保顺序一致，避免 lat/lon 颠倒。

---

## 附录：快速参考

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/map/chunk?bbox=...` | GET | 获取 OSM 行人地图 GeoJSON |
| `/api/upload/sampling_point` | POST | 上传采样点（multipart：图片+jsonData） |
| `/api/navigation/nearby?lat=...&lon=...&radius=...` | GET | 附近采样点空间查询 |
| `/health` | GET | 服务健康检查 |
