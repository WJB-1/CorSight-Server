# **Agent Guidance: 视障出行环境语义地图 \- 模块五后端服务开发指南**

## **1\. 项目全局背景与你的角色 (Project Context)**

**项目目标**：本项目旨在解决现有导航地图对视障群体不友好的问题。我们将构建一个基于“先验语义重构 \+ 大小模型级联 \+ 端云协同调度”的系统。系统会离线建立“专属视障语义地图”（包含盲道、复杂中岛、悬空障碍等），并在用户出行时结合端侧小模型（避障）和云端大模型（VLM复杂推理）提供低延迟、个性化的导航。

**你的角色**：本次任务你需要完成整个系统的**核心基建——模块五（后端空间处理与 API 服务中台）**。该模块承上启下，既要接收前端采集人员上传的街景数据（含图片和坐标），又要为未来的大模型和导航引擎提供极速的地理空间查询能力。

## **2\. 技术栈与架构约束 (Tech Stack & Constraints)**

* **后端框架**：Node.js \+ Express  
* **数据库**：MongoDB (必须使用 Mongoose 库)  
* **多媒体处理**：multer 中间件（用于处理前端 multipart/form-data 请求）  
* **核心能力要求**：必须原生支持**地理空间计算（Geospatial Queries）**，因此 MongoDB 中必须使用 2dsphere 索引和 GeoJSON 格式。

## **3\. 核心数据结构约定 (Data Structure Constraints)**

前端采集端传递的数据包基于一份名为 map\_data.json 的结构。请注意，原始采集的经纬度可能是度分秒格式（如 23°8'11''），但在存入 MongoDB 时，**必须**转化为标准的十进制 GeoJSON Point 格式。

**期望存入 MongoDB 的最终 Schema 结构示例**：

{  
  point\_id: { type: String, required: true, unique: true }, // 如 "P001"  
  location: {  
    type: { type: String, enum: \['Point'\], default: 'Point' },  
    coordinates: { type: \[Number\], required: true } // \[longitude, latitude\] (必须是十进制数字)  
  },  
  scene\_description: { type: String, default: "" },  
  images: {  
    N: String, NE: String, E: String, SE: String,   
    S: String, SW: String, W: String, NW: String  
  } // 存储服务器上的图片相对路径，如 "/public/images/P001\_N.jpg"  
}

## **4\. 子模块拆解与 API 接口规范 (Sub-modules & APIs)**

作为 Agent，你需要实现以下 4 个子模块。为了保证前后端衔接，请严格遵守以下接口规范：

### **4.1 空间数据库写入层 (Sub-module 5.3: Spatial DB Ingestion)**

* **职责**：定义 MongoDB Schema，封装数据库写入逻辑。  
* **关键点**：必须为 location 字段创建 2dsphere 索引。  
* **内部封装方法**：saveSamplingPoint(pointData) 接收解析好的数据包并完成落库。

### **4.2 多媒体接收与解析层 (Sub-module 5.2: Data Receiver)**

* **职责**：处理前端传来的 8 张环视图片 \+ 1 个 JSON 描述的复杂混合包。  
* **接口端点**：POST /api/upload/sampling\_point  
* **请求格式**：multipart/form-data  
* **处理逻辑**：  
  1. 接收最多 8 张图片（字段名可能为 image\_N, image\_NE 等）。  
  2. 重命名图片格式为 \[point\_id\]\_\[方向\].jpg。  
  3. 将图片存入本地服务器 public/images 目录。  
  4. 提取表单中的 jsonData 文本字段，解析为 JavaScript 对象。  
  5. 调用 5.3 模块的写入方法存入数据库。  
* **返回**：成功状态及图片保存的映射路径。

### **4.3 空间半径查询引擎 (Sub-module 5.4: Radius Search Engine)**

* **职责**：为未来的端云协同导航提供前置危险点查询能力。  
* **接口端点**：GET /api/navigation/nearby  
* **请求参数**：lat (纬度), lon (经度), radius (搜索半径，默认 50，单位米)。  
* **查询要求**：使用 MongoDB 的 $nearSphere 或 $geoNear 操作符。  
* **返回**：该范围内所有附带全景图的危险采样点列表（按距离由近到远排序）。

### **4.4 OSM 代理与数据过滤层 (Sub-module 5.1: Overpass Proxy)**

* **职责**：作为前端的代理，查询 OSM 数据库并进行数据“瘦身”，防止前端加载无用要素（如高架桥）。  
* **接口端点**：GET /api/map/chunk  
* **请求参数**：bbox (格式：minLon,minLat,maxLon,maxLat)。  
* **处理逻辑**：  
  1. 使用 axios 向 Overpass API 发起请求。  
  2. 构造 Overpass QL 语句，要求**只查询** Bounding Box 内的：highway=pedestrian, highway=footway, highway=steps, highway=crossing。  
  3. 将 OSM 返回的结构解析/转换为标准的 GeoJSON 格式返回给前端。

## **5\. 建议的 Vibe Coding 执行顺序 (Execution Sequence)**

请按照以下顺序生成代码，以确保依赖关系的稳定构建和低出错率：

1. **第一步（打骨架）**：完成 **子模块 5.3**。编写 Mongoose Schema 模型配置和数据库连接代码。验证 2dsphere 索引是否正确配置。  
2. **第二步（通数据）**：完成 **子模块 5.2**。配置 multer 中间件，编写文件上传和 JSON 混合解析接口。将其与第一步的模型连接，跑通假数据上传落库流程。  
3. **第三步（验查询）**：完成 **子模块 5.4**。基于入库的数据，编写地理空间半径查询接口。  
4. **第四步（外部对接）**：完成 **子模块 5.1**。编写独立于本地数据库的 OSM Overpass 代理请求与清洗逻辑。

## **6\. 特别注意 (Edge Cases & Reminders)**

* 经纬度次序陷阱：MongoDB GeoJSON 的 coordinates 数组顺序必须是 \[longitude, latitude\]（先经度后纬度），而前端传入或常规习惯往往是 lat, lon。解析时务必做显式转换！  
* 容错处理：处理前端上传时，某几个方向的图片可能为空（如 map\_data.json 中 P009 缺失 W 方向图片），需要做空值保护，不要使程序崩溃。