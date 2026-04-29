# 前端服务层 - 模块一、二使用指南

## 目录

- [模块一：区块网格管理器](#模块一区块网格管理器)
- [模块二：OSM 底图加载器](#模块二osm-底图加载器)
- [完整使用示例](#完整使用示例)

---

## 模块一：区块网格管理器

**文件**: `src/utils/gridManager.ts`

### 核心功能

将经纬度转换为 Web Mercator 瓦片坐标（Slippy Map Tilenames），默认 Zoom Level 为 16（约 500m × 500m 区块）。

### API 接口

```typescript
import * as gridManager from '@/utils/gridManager';
```

#### 1. getTile - 计算瓦片坐标

```typescript
const tile = gridManager.getTile(lat, lon, zoom = 16);
// 返回: { x: number, y: number, z: number, chunkId: string }
// chunkId 格式: "16_53943_27755"
```

**示例**:
```typescript
// 广州某坐标
const tile = gridManager.getTile(23.1364, 113.3223);
console.log(tile);
// { x: 53943, y: 27755, z: 16, chunkId: "16_53943_27755" }
```

#### 2. getTileBoundingBox - 获取瓦片边界

```typescript
const bbox = gridManager.getTileBoundingBox(x, y, z);
// 返回: [minLon, minLat, maxLon, maxLat]
```

**示例**:
```typescript
const bbox = gridManager.getTileBoundingBox(53943, 27755, 16);
console.log(bbox);
// [113.318481, 23.134398, 113.323364, 23.139299]
```

#### 3. getCurrentAndSurroundingChunks - 获取九宫格

```typescript
const chunks = gridManager.getCurrentAndSurroundingChunks(lat, lon, zoom = 16);
// 返回: string[] - 9 个 chunkId
```

**示例**:
```typescript
const chunks = gridManager.getCurrentAndSurroundingChunks(23.1364, 113.3223);
console.log(chunks);
// [
//   "16_53942_27754", "16_53943_27754", "16_53944_27754",
//   "16_53942_27755", "16_53943_27755", "16_53944_27755",
//   "16_53942_27756", "16_53943_27756", "16_53944_27756"
// ]
```

#### 4. 其他工具函数

```typescript
// 度分秒转十进制
dmsToDecimal("23°8'11''"); // 23.136388...

// 解析 chunkId
parseChunkId("16_53943_27755"); // { x: 53943, y: 27755, z: 16 }

// 计算两点距离（米）
calculateDistance(lat1, lon1, lat2, lon2);

// 检查是否跨越瓦片边界
hasCrossedTileBoundary(prevLat, prevLon, currLat, currLon, zoom);
```

---

## 模块二：OSM 底图加载器

**文件**: `src/services/mapService.ts`

### 核心功能

结合模块一，调用后端 OSM 代理接口，实现静默加载、按需拉取、防重复请求的缓存控制。

### API 接口

```typescript
import mapService from '@/services/mapService';
```

#### 1. fetchMapDataByLocation - 加载地图数据

```typescript
const geoJSON = await mapService.fetchMapDataByLocation(lat, lon);
// 返回: GeoJSON | null
// - 成功: 返回 GeoJSON 数据
// - 已缓存: 返回 null
```

**示例**:
```typescript
// 首次调用会发起网络请求
const data1 = await mapService.fetchMapDataByLocation(23.1364, 113.3223);
console.log(data1); // GeoJSON 数据

// 同一区块再次调用，直接返回 null（已缓存）
const data2 = await mapService.fetchMapDataByLocation(23.1365, 113.3224);
console.log(data2); // null
```

#### 2. preloadSurroundingChunks - 预加载九宫格

```typescript
await mapService.preloadSurroundingChunks(lat, lon);
```

**示例**:
```typescript
// 用户位置确定后，预加载周围区块
await mapService.preloadSurroundingChunks(23.1364, 113.3223);
// 后台静默加载 9 个区块
```

#### 3. checkAndLoadOnBoundaryCross - 边界跨越检测

```typescript
const hasCrossed = await mapService.checkAndLoadOnBoundaryCross(
  prevLat, prevLon, currLat, currLon
);
// 返回: boolean - 是否跨越了边界
```

**示例**:
```typescript
// 在位置更新回调中使用
function onLocationUpdate(newLat, newLon) {
  const hasCrossed = await mapService.checkAndLoadOnBoundaryCross(
    lastLat, lastLon, newLat, newLon
  );
  if (hasCrossed) {
    console.log('进入新区块，已自动加载数据');
  }
  lastLat = newLat;
  lastLon = newLon;
}
```

#### 4. 缓存管理

```typescript
// 获取已加载区块数量
mapService.getLoadedChunkCount(); // number

// 获取已加载区块列表
mapService.getLoadedChunkIds(); // string[]

// 检查指定区块是否已加载
mapService.isChunkLoaded("16_53943_27755"); // boolean

// 清空缓存（退出地图页面时调用）
mapService.clearCache();

// 强制刷新区块
await mapService.refreshChunk(lat, lon);
```

---

## 完整使用示例

### 场景：地图页面初始化

```typescript
import { gridManager, mapService } from '@/services';

export default {
  data() {
    return {
      currentChunkId: '',
      geoJSONData: null,
    };
  },

  async onLoad() {
    // 1. 获取当前位置
    const { latitude, longitude } = await this.getCurrentLocation();

    // 2. 计算当前区块
    const tile = gridManager.getTile(latitude, longitude);
    this.currentChunkId = tile.chunkId;
    console.log(`当前区块: ${tile.chunkId}`);

    // 3. 加载当前区块数据
    const data = await mapService.fetchMapDataByLocation(latitude, longitude);
    if (data) {
      this.geoJSONData = data;
      this.renderMap(data);
    }

    // 4. 预加载周围区块（后台静默加载）
    mapService.preloadSurroundingChunks(latitude, longitude);
  },

  // 位置更新回调
  async onLocationUpdate(newLat, newLon) {
    // 检查是否跨越瓦片边界
    const hasCrossed = await mapService.checkAndLoadOnBoundaryCross(
      this.lastLat, this.lastLon, newLat, newLon
    );

    if (hasCrossed) {
      // 更新当前区块显示
      const tile = gridManager.getTile(newLat, newLon);
      this.currentChunkId = tile.chunkId;
    }

    this.lastLat = newLat;
    this.lastLon = newLon;
  },

  onUnload() {
    // 退出页面时清理缓存
    mapService.clearCache();
  },
};
```

### 场景：结合模块四采集数据

```typescript
import { 
  gridManager, 
  mapService, 
  createSamplingPoint,
  syncService 
} from '@/services';

// 采集流程
async function collectScene(lat, lon, description, imagePaths) {
  // 1. 获取当前 chunkId（模块一）
  const tile = gridManager.getTile(lat, lon);
  console.log(`采集点所属区块: ${tile.chunkId}`);

  // 2. 创建采样点（模块四）
  const pointId = createSamplingPoint(lat, lon, description, imagePaths);
  console.log(`采样点创建成功: ${pointId}`);

  // 3. 网络可用时同步（模块四）
  const results = await syncService.syncPendingTasks();
  console.log(`同步结果:`, results);
}
```

---

## 与后端接口对接

模块二默认调用以下后端接口（模块五）：

```
GET /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}
```

**请求示例**:
```
GET /api/map/chunk?bbox=113.318481,23.134398,113.323364,23.139299
```

**返回示例**:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[113.32, 23.135], [113.321, 23.136]]
      },
      "properties": {
        "highway": "footway"
      }
    }
  ]
}
```

如需修改后端地址，请修改 `mapService.ts` 中的 `API_BASE_URL`。
