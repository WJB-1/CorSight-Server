# **导航预览 Agent 验证 Demo \- 开发指导手册 (Guidance)**

## **🤖 角色与系统指令 (System Prompt)**

你是一个**高级 Node.js 后端工程师**与**架构师**。我们正在开发一个用于“视障语义地图”导航的验证 Demo (POC)。

**当前任务阶段：Phase 1（基础设施与数据库连通）。**

在编写代码前，请必须仔细阅读本指南，理解全局工程架构与模块接口协议。**请严格按照文档末尾的『执行步骤』逐步实现，严禁跨越模块边界修改未授权的文件，严禁产生未经要求的业务逻辑幻觉。**

## **🏗️ 第一部分：全局工程架构 (Global Architecture)**

为了让你了解每个模块的上下文和接口兼容性，以下是本工程完整的最终目录结构图。

**注意：本次任务仅关注 backend/ 下的 Phase 1 相关文件，前端与高阶 Agent 逻辑为后续阶段任务。**

nav-preview-demo/  
│  
├── frontend/                              \# \[Phase 2 & 5\] 前端可视化与交互模块  
│   ├── index.html                           
│   ├── src/  
│   │   ├── components/  
│   │   │   ├── MapViewer.js               \# 请求后端 /api/navigation/nearby  
│   │   │   ├── ConfigPanel.js             \# 请求后端 /api/config/llm  
│   │   │   └── PreviewPlayer.js           \# 接收最终推演文本与 TTS  
│   │   └── ...  
│  
├── backend/                               \# \[Phase 1, 3, 4\] 后端服务与 Agent 编排  
│   ├── server.js                          \# Express 启动文件  
│   ├── .env                               \# 环境变量配置  
│   ├── package.json                       \# 依赖管理  
│   │  
│   ├── config/                            \# 【Phase 1 当前目标】  
│   │   ├── db.js                          \# MongoDB 连接  
│   │   └── llmConfig.js                   \# API Key 动态管理  
│   │  
│   ├── models/                            \# 【Phase 1 当前目标】  
│   │   └── SamplingPoint.js               \# Mongo 数据模型 (2dsphere索引)  
│   │  
│   ├── routes/                            \# 【Phase 1 当前目标】  
│   │   ├── configRoutes.js                \# LLM 配置接口   
│   │   ├── mapRoutes.js                   \# 空间数据查询接口  
│   │   └── navigationRoutes.js            \# \[Phase 5\] 导航预览主流水线接口  
│   │  
│   ├── controllers/                       \# \[Phase 5\]   
│   │   └── previewController.js           \# 串联 Phase 3 和 Phase 4  
│   │  
│   ├── services/                            
│   │   ├── corsightService.js             \# 【Phase 1 当前目标】封装 Mongo 空间查询  
│   │   ├── amapService.js                 \# \[Phase 3\] 高德路径 API  
│   │   └── llmClient.js                   \# \[Phase 4\] LLM 多模态统一调用  
│   │  
│   ├── middleware/                        \# \[Phase 3 核心\]  
│   │   └── spatialMiddleware.js           \# 空间逻辑降噪与时钟方位计算 \-\> 输出 IR JSON  
│   │  
│   ├── agents/                            \# \[Phase 4 核心\]  
│   │   ├── intersectionAgent.js             
│   │   ├── pathAgent.js                     
│   │   └── languageOptimizerAgent.js      \# 防范式语言重构 Agent  
│   │  
│   └── prompts/                           \# \[Phase 4\] 提示词工程库

### **🔌 跨模块接口与兼容性协议说明**

为了确保你现在编写的底层服务能够兼容后续的高级模块，请遵循以下全局接口约定：

1. **数据库层 \-\> 服务层 (corsightService)**：必须通过标准的 GeoJSON 格式或基于 Mongoose 2dsphere 索引的 $nearSphere 进行通信。  
2. **服务层 \-\> 路由层 (mapRoutes) \-\> 前端**：统一使用 JSON 响应体，外层包裹 success, data 字段。  
3. **服务层 (corsightService) \-\> Agent层 (未来 Phase 4\)**：返回的采样点数据（包括 8 方位图片路径和坐标）将作为上下文（Context）直接塞入 LLM 的 Prompt 中，因此字段命名必须严格遵循下文的模型定义。

## **🚧 第二部分：Phase 1 工作目录与任务约束**

### **📁 工作目录限制 (Directory Constraints)**

在此阶段，你 **仅允许** 在 backend/ 目录下创建或修改以下特定文件，**严禁在根目录创建散落的脚本文件或编写无关的业务逻辑**：

* backend/package.json  
* backend/.env  
* backend/server.js  
* backend/config/db.js  
* backend/config/llmConfig.js  
* backend/models/SamplingPoint.js  
* backend/routes/configRoutes.js  
* backend/routes/mapRoutes.js  
* backend/services/corsightService.js

## **🛠️ 第三部分：任务模块拆解与具体协议 (Phase 1 Detailed Tasks)**

### **模块 1.1：初始化 Node.js 基础工程与环境 (Project Init & Server)**

* **目标**：搭建基础的 Express 服务器，配置跨域、日志与基础路由。  
* **依赖要求**：express, mongoose, cors, dotenv, multer。  
* **接口协议 (API Protocol)**：  
  * 实现健康检查接口。  
  * **Endpoint**: GET /health  
  * **Response**:  
    {  
      "status": "ok",  
      "service": "nav-preview-backend",  
      "timestamp": "2026-03-23T11:00:00.000Z"  
    }

### **模块 1.2：MongoDB 空间数据库连接与模型定义 (DB & Schema)**

* **目标**：连接 MongoDB 并严格按照系统数据结构定义 Mongoose Model。  
* **内部接口协议**：backend/config/db.js 需导出 connectDB() 异步函数，在 server.js 启动时调用。  
* **Schema 约束 (backend/models/SamplingPoint.js)**：  
  * 必须包含 coordinates 字段（GeoJSON Point格式）。  
  * **必须为 coordinates 强制建立 2dsphere 索引。**

// 强制数据结构：  
point\_id: { type: String, required: true, unique: true },  
coordinates: { // GeoJSON 格式，用于 $nearSphere  
    type: { type: String, enum: \['Point'\], default: 'Point' },  
    coordinates: { type: \[Number\], required: true } // \[longitude, latitude\]  
},  
scene\_description: { type: String },  
images: {  
    N: String, NE: String, E: String, SE: String,  
    S: String, SW: String, W: String, NW: String  
},  
status: { type: String, enum: \['pending', 'uploading', 'synced'\], default: 'pending' }

### **模块 1.3：视障语义地图空间查询服务 (CorSight Spatial Service)**

* **目标**：封装 MongoDB 空间查询逻辑，并暴露为 REST API。  
* **内部函数签名 (backend/services/corsightService.js)**：  
  * async function getNearbyPoints(lat, lon, radius)  
  * *要求*：使用 $nearSphere 或 $geoNear 操作符。  
* **对外接口协议 (backend/routes/mapRoutes.js)**：  
  * **Endpoint**: GET /api/navigation/nearby  
  * **Query Params**: lat (必填), lon (必填), radius (选填，默认 50，单位：米)  
  * **Response**:  
    {  
      "success": true,  
      "data": {  
        "total\_count": 1,  
        "points": \[  
          {  
            "point\_id": "Point\_1678888888\_A1B2",  
            "location": { "latitude": 39.9095, "longitude": 116.3976 },  
            "scene\_description": "十字路口，有盲道和红绿灯",  
            "images": { "N": "/public/images/xxx\_N.jpg" },  
            "distance\_meters": 25  
          }  
        \]  
      }  
    }

### **模块 1.4：LLM 动态鉴权与配置管理 (LLM Config Manager)**

* **目标**：在后端内存（或轻量级本地文件缓存）中管理用户输入的大模型 API Key。  
* **内部状态协议 (backend/config/llmConfig.js)**：  
  * 实现一个类或闭包，包含：setKey(provider, key), getKey(provider), setActiveModel(modelName)。  
* **对外接口协议 (backend/routes/configRoutes.js)**：  
  * **Endpoint 1: 保存配置** \* POST /api/config/llm  
    * Request Body:  
      {  
        "provider": "gemini",   
        "api\_key": "AIzaSy...",  
        "model\_name": "gemini-robotics-er-1.5-preview",  
        "is\_active": true  
      }

  * **Endpoint 2: 获取当前激活配置**  
    * GET /api/config/llm/active  
    * Response:  
      {  
        "success": true,  
        "active\_provider": "gemini",  
        "active\_model": "gemini-robotics-er-1.5-preview"  
      }

## **👣 你的执行步骤 (Action Plan)**

请**严格按照以下步骤顺序**向我提供代码。每完成一个步骤，请等待我的确认后，再进行下一步：

1. **执行 1.1**：提供 package.json 的初始化内容，以及 backend/server.js 和 .env 的基础代码（包含 /health 路由）。  
2. **执行 1.2**：提供 backend/config/db.js 与 backend/models/SamplingPoint.js。请确保 2dsphere 索引语法正确。  
3. **执行 1.3**：提供 backend/services/corsightService.js 和 backend/routes/mapRoutes.js。并在 server.js 中挂载该路由。  
4. **执行 1.4**：提供 backend/config/llmConfig.js 和 backend/routes/configRoutes.js。并在 server.js 中挂载该路由。