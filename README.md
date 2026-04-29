# CorSight Navigation - 视障语义地图系统

CorSight Navigation 是一个专为视障人士设计的语义地图与导航系统，通过众包采集 8 方位街景图像，结合 OSM 行人路网数据，为视障用户提供高精度的步行导航与危险点预警服务。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CorSight Navigation 架构图                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────┐     │
│   │   前端 APP    │      │   前端 APP    │      │     第三方应用        │     │
│   │  (uni-app)   │◄────►│  (uni-app)   │◄────►│   (导航/地图 SDK)    │     │
│   └──────┬───────┘      └──────┬───────┘      └──────────┬───────────┘     │
│          │                     │                         │                 │
│          └─────────────────────┴─────────────────────────┘                 │
│                                    │                                        │
│                                    ▼                                        │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │                         后端服务 (Node.js)                        │     │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │     │
│   │  │ Overpass    │  │  Data       │  │  Spatial    │  │ Radius  │ │     │
│   │  │ Proxy       │  │  Receiver   │  │  DB         │  │ Search  │ │     │
│   │  │ (OSM地图)   │  │  (数据上传)  │  │  Ingestion  │  │ Engine  │ │     │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                    │                                        │
│                                    ▼                                        │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │                      MongoDB + 静态文件存储                        │     │
│   │         采样点数据 (2dsphere索引)      街景图片文件                │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心功能模块

### 模块一：网格管理系统 (Grid Manager)
- 基于 WGS84 坐标的瓦片网格划分
- 支持九宫格预加载策略
- 防止重复请求的缓存控制

### 模块二：地图服务 (Map Service)
- OSM 行人路网数据代理与过滤
- 按需拉取指定 BBox 范围的 GeoJSON 数据
- 支持 `highway=pedestrian|footway|steps|crossing` 等要素

### 模块四：端云同步引擎 (Sync Engine)
- 本地离线存储 (uni-app Storage)
- 断点续传与批量同步
- 8 方位图片上传管理

### 模块五：后端服务 (Backend)
- **5.1 Overpass Proxy**: OSM 数据代理层
- **5.2 Data Receiver**: 多媒体接收与解析
- **5.3 Spatial DB**: 地理空间数据库
- **5.4 Radius Search**: 空间半径查询引擎

## API 接口文档

### 1. 健康检查

**请求**
```http
GET /health
```

**响应**
```json
{
  "status": "ok",
  "timestamp": "2026-03-23T11:00:00.000Z",
  "service": "blind-map-backend",
  "version": "1.0.0"
}
```

---

### 2. 获取 OSM 地图数据 (Map Chunk)

获取指定边界框内的 OSM 行人相关地图数据。

**请求**
```http
GET /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}
```

**参数说明**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| bbox | string | 是 | 边界框，格式：`minLon,minLat,maxLon,maxLat` |

**示例**
```http
GET /api/map/chunk?bbox=116.3974,39.9093,116.4074,39.9193
```

**响应**
```json
{
  "success": true,
  "data": {
    "bbox": {
      "minLon": 116.3974,
      "minLat": 39.9093,
      "maxLon": 116.4074,
      "maxLat": 39.9193
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
            "coordinates": [[116.3974, 39.9093], [116.398, 39.91]]
          },
          "properties": {
            "highway": "footway",
            "foot": "yes"
          }
        }
      ]
    },
    "element_count": 15
  }
}
```

**限制**
- 最大查询范围：约 1° x 1°（赤道附近约 111km x 111km）
- 超时时间：30 秒

---

### 3. 上传采样点数据 (Upload Sampling Point)

上传街景采样点数据（8 方位图片 + JSON 描述）。

**请求**
```http
POST /api/upload/sampling_point
Content-Type: multipart/form-data
```

**表单字段**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| jsonData | string | 是 | JSON 格式的采样点数据 |
| image_N | file | 否 | 北方向图片 |
| image_NE | file | 否 | 东北方向图片 |
| image_E | file | 否 | 东方向图片 |
| image_SE | file | 否 | 东南方向图片 |
| image_S | file | 否 | 南方向图片 |
| image_SW | file | 否 | 西南方向图片 |
| image_W | file | 否 | 西方向图片 |
| image_NW | file | 否 | 西北方向图片 |

**jsonData 格式**
```json
{
  "point_id": "Point_1678888888_A1B2",
  "coordinates": {
    "longitude": 116.3974,
    "latitude": 39.9093
  },
  "scene_description": "十字路口，有盲道和红绿灯",
  "status": "pending"
}
```

**响应**
```json
{
  "success": true,
  "message": "采样点上传成功",
  "data": {
    "point_id": "Point_1678888888_A1B2",
    "images_saved": ["N", "E", "S", "W"],
    "images_count": 4,
    "scene_description": "十字路口，有盲道和红绿灯"
  }
}
```

**限制**
- 单张图片最大：22MB
- 最多 8 张图片
- 支持格式：JPEG, PNG

---

### 4. 查询附近采样点 (Nearby Search)

基于地理位置查询周边的采样点，用于危险点预警。

**请求**
```http
GET /api/navigation/nearby?lat={latitude}&lon={longitude}&radius={radius}
```

**参数说明**
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| lat | number | 是 | - | 纬度 (-90 ~ 90) |
| lon | number | 是 | - | 经度 (-180 ~ 180) |
| radius | integer | 否 | 50 | 搜索半径 (米，最大 10000) |

**示例**
```http
GET /api/navigation/nearby?lat=39.9093&lon=116.3974&radius=100
```

**响应**
```json
{
  "success": true,
  "data": {
    "query": {
      "center": {
        "latitude": 39.9093,
        "longitude": 116.3974
      },
      "radius_meters": 100
    },
    "total_count": 3,
    "points": [
      {
        "rank": 1,
        "point_id": "Point_1678888888_A1B2",
        "location": {
          "latitude": 39.9095,
          "longitude": 116.3976
        },
        "scene_description": "十字路口，有盲道和红绿灯",
        "images": {
          "N": "/public/images/Point_1678888888_A1B2_N.jpg",
          "S": "/public/images/Point_1678888888_A1B2_S.jpg"
        },
        "distance_meters": 25,
        "createdAt": "2026-03-23T10:00:00.000Z",
        "updatedAt": "2026-03-23T10:00:00.000Z"
      }
    ]
  }
}
```

---

## 第三方应用接入指南

### 场景一：导航应用集成

适用于第三方导航应用接入视障地图数据，增强对视障用户的支持。

#### 1. 获取附近危险点（预警功能）

```javascript
// 示例：在导航过程中查询前方危险点
async function checkNearbyHazards(userLat, userLon, radius = 100) {
  const response = await fetch(
    `https://api.blind-map.example.com/api/navigation/nearby?lat=${userLat}&lon=${userLon}&radius=${radius}`
  );
  const result = await response.json();
  
  if (result.success && result.data.total_count > 0) {
    // 按距离排序，最近的最优先提醒
    const hazards = result.data.points.sort((a, b) => a.distance_meters - b.distance_meters);
    
    // 语音提醒用户
    const nearest = hazards[0];
    speak(`前方 ${nearest.distance_meters} 米处有${nearest.scene_description}`);
    
    return hazards;
  }
  return [];
}
```

#### 2. 加载行人路网地图

```javascript
// 示例：加载当前视窗的 OSM 行人路网
async function loadPedestrianMap(minLon, minLat, maxLon, maxLat) {
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const response = await fetch(
    `https://api.blind-map.example.com/api/map/chunk?bbox=${encodeURIComponent(bbox)}`
  );
  const result = await response.json();
  
  if (result.success) {
    // 将 GeoJSON 添加到地图图层
    map.addLayer({
      id: 'pedestrian-network',
      type: 'line',
      source: {
        type: 'geojson',
        data: result.data.geojson
      },
      paint: {
        'line-color': '#4285F4',
        'line-width': 3
      }
    });
    return result.data.geojson;
  }
}
```

### 场景二：数据采集应用集成

适用于需要贡献街景数据的第三方应用。

#### 1. 上传采样点数据

```javascript
// 示例：上传街景采样点
async function uploadSamplingPoint(pointData, imageFiles) {
  const formData = new FormData();
  
  // 添加 JSON 数据
  formData.append('jsonData', JSON.stringify({
    point_id: pointData.point_id,
    coordinates: pointData.coordinates,
    scene_description: pointData.scene_description
  }));
  
  // 添加图片文件
  for (const [direction, file] of Object.entries(imageFiles)) {
    formData.append(`image_${direction}`, file);
  }
  
  const response = await fetch('https://api.blind-map.example.com/api/upload/sampling_point', {
    method: 'POST',
    body: formData
  });
  
  return await response.json();
}
```

### 场景三：数据可视化平台

适用于地图数据可视化、城市规划分析等应用。

#### 1. 批量获取采样点数据

```javascript
// 示例：获取指定区域内的所有采样点（需分页）
async function getAllSamplingPointsInArea(lat, lon, radius, page = 1, limit = 50) {
  // 注意：当前 API 单次最多返回 10000 米范围内的数据
  // 如需更大范围，请分多次查询不同中心点
  const response = await fetch(
    `https://api.blind-map.example.com/api/navigation/nearby?lat=${lat}&lon=${lon}&radius=${radius}`
  );
  return await response.json();
}
```

### 认证与限流

> **注意**: 当前版本为开放 API，无需认证。生产环境建议：
> - 添加 API Key 认证
> - 实施请求限流（Rate Limiting）
> - 使用 HTTPS 加密传输

---

## 数据结构

### 采样点 (SamplingPoint)

```typescript
interface SamplingPoint {
  point_id: string;           // 唯一标识，格式：Point_<timestamp>_<random>
  coordinates: {
    longitude: number;        // 经度 (WGS84)
    latitude: number;         // 纬度 (WGS84)
  };
  scene_description?: string; // 场景文字描述
  images: {
    N?: string;               // 北方向图片 URL
    NE?: string;              // 东北方向图片 URL
    E?: string;               // 东方向图片 URL
    SE?: string;              // 东南方向图片 URL
    S?: string;               // 南方向图片 URL
    SW?: string;              // 西南方向图片 URL
    W?: string;               // 西方向图片 URL
    NW?: string;              // 西北方向图片 URL
  };
  status: 'pending' | 'uploading' | 'synced';
  timestamp: number;          // 创建时间戳（Unix 毫秒）
}
```

### GeoJSON 行人路网

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[116.3974, 39.9093], [116.398, 39.91]]
      },
      "properties": {
        "highway": "footway",
        "foot": "yes",
        "surface": "asphalt",
        "tactile_paving": "yes"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [116.3974, 39.9093]
      },
      "properties": {
        "highway": "crossing",
        "crossing": "traffic_signals",
        "tactile_paving": "yes"
      }
    }
  ]
}
```

---

## 安装部署

### 环境要求
- Node.js >= 16.0
- MongoDB >= 4.4（需支持 2dsphere 索引）

### 后端部署

```bash
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 MongoDB 连接字符串等

# 启动服务
npm start
```

### 前端开发

```bash
cd frontend

# 使用 HBuilderX 或 Vue CLI 打开项目
# 支持编译到：微信小程序、支付宝小程序、App、H5 等平台
```

### 数据导入

```bash
cd data_pipeline

# 导入种子数据到 MongoDB
node import_seed_data.js
```

---

## 项目目录结构

```
.
├── backend/                    # 后端服务 (Node.js + Express)
│   ├── app.js                 # 主应用入口
│   ├── config/                # 配置文件
│   ├── models/                # 数据模型
│   ├── routes/                # API 路由
│   │   ├── map.js            # OSM 地图接口
│   │   ├── navigation.js     # 导航查询接口
│   │   └── upload.js         # 数据上传接口
│   └── public/                # 静态资源
│       └── images/           # 上传的街景图片
├── frontend/                   # 前端应用 (uni-app)
│   └── src/
│       ├── services/         # 服务层
│       │   ├── mapService.ts    # 地图服务
│       │   ├── storageService.ts # 本地存储
│       │   └── syncService.ts   # 端云同步
│       ├── types/            # TypeScript 类型定义
│       └── utils/            # 工具函数
├── data_pipeline/             # 数据导入脚本
├── test/                      # 测试脚本
└── project/                   # 项目文档
```

---

## 开源协议

MIT License

---

## 联系方式

- 项目主页：https://github.com/your-org/corsight-navigation
- 问题反馈：https://github.com/your-org/corsight-navigation/issues
- 邮箱：contact@corsight.example.com

---

**CorSight Navigation** - 让每一步都更安心 🚶‍♂️👨‍🦯
