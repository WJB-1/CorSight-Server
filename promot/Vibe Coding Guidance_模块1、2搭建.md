# **视障出行语义地图项目 \- 前端基建开发指南 (AI Agent Guidance)**

## **1\. 项目背景与技术路线 (Context & Vision)**

本项目旨在解决传统导航无法满足视障群体真实需求（如悬空障碍、无围栏水域等盲区）的问题。同时，为了避免全程使用大模型 (VLM) 带来的极高算力成本和手机发热问题，我们采用了\*\*“先验语义重构 \+ 大小模型级联 \+ 端云协同调度”\*\*的技术路线。

核心思想是：将高昂的大模型计算成本转移到离线预处理阶段，构建专属的“视障语义地图”。前端通过轻量级采集工具完成地理信息与图像数据的采集，并按特定的网格（Chunk）进行管理与按需加载。

## **2\. 工程全局架构 (Project Architecture)**

项目采用前后端分离架构，当前前端为基于微信小程序生态的 uni-app 环境。

Blind\_map\_Project/           \# 项目根目录  
├── docs/                    \# 存放所有说明文档  
├── backend/                 \# Node.js \+ Express \+ MongoDB (后端接收与地图SDK)  
├── frontend/    \# Uni-app 前端采集小程序 (当前工作区)  
│   ├── src/  
│   │   ├── utils/           \# 工具类库 (本次开发重点)  
│   │   └── services/        \# 业务逻辑与接口调用 (本次开发重点)  
└── data\_pipeline/           \# Python 专属基建 (OSM数据解析等)

**系统共拆分为五大模块：**

* **模块一：区块网格管理器 (前端)** \- 将经纬度转换为 500m x 500m 的瓦片网格 (Chunk ID)。  
* **模块二：OSM 底图加载与解析器 (前端)** \- 按区块缓存和加载路网数据。  
* **模块三：采集引导与传感器引擎 (前端)** \- 罗盘与硬件交互，引导 8 方位拍摄。  
* **模块四：本地存储与端云同步引擎 (前端)** \- 弱网环境下的 map\_database.json 格式组装与离线/在线同步。  
* **模块五：后端空间操作库 (后端)** \- 基于 MongoDB 2dsphere 索引的数据存取。

## **3\. 当前任务目标 (Current Sprint Objective)**

**本次任务专注开发前端小程序 (frontend\_miniprogram) 的 模块一 和 模块二。** 你需要作为前端架构师，编写纯粹、轻量、高内聚的 TypeScript 类/服务，为后续的地图渲染和数据采集打下基础。

### **⚠️ 核心开发原则：**

1. **零外部 GIS 依赖**：在生成算法时，**绝对禁止**引入 Turf.js 等庞大的 GIS 库，必须使用纯原生的 TypeScript Math 函数（如 Math.PI, Math.tan 等）手写公式，以保证小程序极速启动。  
2. **环境兼容**：网络请求必须使用 uni.request，缓存操作使用小程序的全局状态或单例类。

## **4\. 模块详细设计与接口契约 (Module Specifications & Interfaces)**

### **模块一：区块网格管理器 (Spatial Grid Manager)**

**文件路径**: frontend/src/utils/gridManager.ts

**职责**: 实现轻量级的 Web Mercator 瓦片算法 (Slippy Map Tilenames)，实现经纬度到区块边界的相互转换。默认 Zoom Level 为 16 (约 500m x 500m 区块)。

**接口定义 (必须严格实现并导出以下函数)**:

/\*\*  
 \* 根据经纬度和缩放级别计算瓦片坐标  
 \* @returns chunkId 格式必须严格为: "{z}\_{x}\_{y}"  
 \*/  
export function getTile(lat: number, lon: number, zoom: number \= 16): { x: number, y: number, z: number, chunkId: string };

/\*\*  
 \* 根据瓦片坐标，反向计算出该区块的真实地理边界  
 \* @returns 格式严格为: \[minLon, minLat, maxLon, maxLat\] (先经后纬，南西为 min)  
 \*/  
export function getTileBoundingBox(x: number, y: number, z: number): \[number, number, number, number\];

/\*\*  
 \* 计算当前坐标所在的中心区块，以及周围一圈的 8 个区块（九宫格）  
 \* @returns chunkId 的数组，用于前端视野预加载  
 \*/  
export function getCurrentAndSurroundingChunks(lat: number, lon: number, zoom: number \= 16): string\[\];

### **模块二：OSM 底图加载与服务调度器 (OSM Map Service)**

**文件路径**: frontend/src/services/mapService.ts

**职责**: 结合模块一，调用后端 OSM 代理接口，实现静默加载、按需拉取、防重复请求的缓存控制。

**接口定义 (需导出 MapService 单例类)**:

import \* as gridManager from '../utils/gridManager';

class MapService {  
    // 必须包含私有缓存集合，记录已加载的 chunkId 避免重复请求网络  
    private loadedChunks: Set\<string\>; 

    /\*\*  
     \* 核心加载逻辑：  
     \* 1\. 算 chunkId \-\> 2\. 查缓存 \-\> 3\. 命中则直接返回 null/缓存标识   
     \* \-\> 4\. 未命中则算 BBox \-\> 5\. 发起 uni.request 到后端 \-\> 6\. 加入缓存并返回 GeoJSON  
     \*/  
    public async fetchMapDataByLocation(lat: number, lon: number): Promise\<any | null\>;

    /\*\*  
     \* 清空缓存，用于用户彻底退出地图页面时  
     \*/  
    public clearCache(): void;  
}  
export default new MapService(); // 导出单例

## **5\. 全局模块兼容性与对接指南 (Cross-Module Compatibility)**

为了保证本次开发的模块能与即将开发的模块四、模块五无缝对接，请在编写时注意以下兼容性要求：

### **5.1 与 模块五 (后端 SDK) 的接口兼容**

* **请求约定**：mapService.ts 在发起网络请求时，必须拼装边界字符串并调用后端的标准路由：  
  * **Endpoint**: /api/map/chunk?bbox={minLon},{minLat},{maxLon},{maxLat}  
  * 后端模块五的 getNearbyObstacles 等中间件会拦截此请求，结合 OSM 数据和 MongoDB 数据库返回合并后的 GeoJSON 给前端。前端此处的请求实现必须与该规则严丝合缝。

### **5.2 与 模块四 (Sync Engine) 的后续兼容准备**

* **数据分区标识**：模块四在将本地采集数据持久化或打包为 map\_database.json 格式上传时，会需要知道当前采集点归属哪个区块（为了建立后端 2dsphere 索引和高并发切片）。  
* **兼容预留**：因此，模块一输出的 chunkId (16\_x\_y) 必须全局通用。请确保 gridManager.ts 是纯函数且无状态的，以便未来 syncEngine.ts 可以直接 import 并调用 getTile，将计算出的 chunkId 注入到最终上传的采集点 JSON 结构中。

### **5.3 前端 UI (Map.vue) 的挂载预期**

* 模块一和二开发完成后，UI 层只需要在 uni.getLocation 或位置变动回调中，无脑调用 MapService.fetchMapDataByLocation(lat, lon)。  
* 只有跨越 500m 边界进入新瓦片时才会触发真实网络请求，返回的 GeoJSON 会直接映射为小程序 \<map\> 组件的 polylines。所以请确保返回的 Promise 结构干净整洁。

**Agent 任务指令结束。请开始输出 frontend/src/utils/gridManager.ts 和 frontend/src/services/mapService.ts 的完整代码。**