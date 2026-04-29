# **盲人出行语义地图采集工程 (Blind Map Project) \- Vibe Coding 指南**

你好，AI 助手。你当前正在参与“视障出行环境语义地图”的研发工作。为了保证你生成的代码符合整体系统架构且与其他模块高度兼容，请在编写任何代码前，仔细阅读以下项目背景、架构设计以及模块接口规范。

## **🎯 1\. 项目愿景与技术路线 (Context)**

当前传统导航（如高德、百度）的语义是为机动车和明眼人设计的，缺乏视障人群关心的“悬空障碍”、“无围栏水域”、“异形中岛”等高危地理标签。若全程使用 VLM 大模型实时感知，将带来极高的算力成本、严重的手机发热以及致命的感知延迟。

**我们的技术路线：先验语义重构 \+ 大小模型级联 \+ 端云协同调度**

* **Phase 1 (云端离线)**：通过 VLM 离线处理街景图片，提取视障专属的语义标签，构建“先验语义地图”。  
* **Phase 2 (端侧实时)**：在用户手机端运行轻量级小模型（如 YOLO-lite），负责高频低延迟的基础物理障碍检测。  
* **Phase 3 (端云协同)**：当到达复杂路口或有特定需求时，结合“小模型感知结果”+“先验地图标签”上报云端，唤醒 VLM 进行精准导航。

**本次任务背景**：我们要开发前端的数据采集工具。由于采集人员可能在弱网环境（如地下通道、偏僻路段）工作，因此需要一个**强大的前端离线同步引擎**。

## **📂 2\. 工程目录架构 (Workspace)**

请严格遵守以下目录结构。**本次你的工作区域完全限定在 frontend\_miniprogram/ 目录下**。

Blind\_map\_Project/           \# 项目根目录  
├── backend/                 \# Node.js 后端代码 (模块五所在区域)  
│   ├── app.js                 
│   ├── controllers/           
│   ├── models/                
│   ├── routes/                
│   └── services/              
│  
├── frontend\_miniprogram/    \# 👉 【你的工作区】Uni-app / 微信小程序端  
│   ├── package.json           
│   ├── src/                 \# 页面与组件  
│   │   ├── types/           \# TS 类型定义  
│   │   ├── utils/           \# 工具函数  
│   │   └── services/        \# 核心服务  
│   └── vite.config.js         
│  
└── data\_pipeline/           \# Python 数据基建  
    └── osm\_parser.py        

## **🧩 3\. 全局模块规划与接口规范 (Interfaces)**

整个采集端到后端的链路分为 5 个模块。你需要了解全貌，以确保你负责的**模块四**能承上启下。

* **模块一：区块网格管理器** (输入: lat, lon \-\> 输出: chunkId, boundingBox)  
* **模块二：OSM 底图加载器** (输入: boundingBox \-\> 输出: GeoJSON 路网)  
* **模块三：传感器引擎 (UI 层)** (输入: 罗盘硬件 \-\> 输出: N/S/E/W 八方位的本地照片)  
* **👉 模块四：本地存储与端云同步引擎 (本次任务)**  
  * **接口入参 (承接模块三)**:  
    * lat, lon (经纬度)  
    * scene\_description (场景文字描述)  
    * localImagePaths (Record\<string, string\>，8个方向的**本地**图片路径)  
  * **职责**: 组装标准 JSON，存入本地 Storage，并在网络连通时并发上传图片，最后上传 JSON。  
* **模块五：后端空间操作库 (必须兼容)**  
  * **后端接收要求**: 后端 /api/upload/sampling\_point 接口将把数据存入 MongoDB 并建立 2dsphere 索引。  
  * **兼容性契约**: 模块四发给模块五的 JSON 格式**必须**符合以下 map\_data.json 标准：  
    {  
      "point\_id": "Point\_1678888888\_A1B2",  
      "coordinates": { "longitude": 116.3, "latitude": 39.9 },  
      "scene\_description": "...",  
      "images": { "N": "https://云端URL/1.jpg", "S": "https://云端URL/2.jpg" },  
      "status": "synced",  
      "timestamp": 1678888888  
    }

    *(注：传给后端时，images 里的路径必须是已经上传成功后的**云端 URL**，不能是本地路径)*

## **🚀 4\. 执行任务：构建模块四 (Execution Steps)**

请依次执行以下 4 个步骤来完成代码生成。**请严格使用 TypeScript，并确保路径建立在 frontend\_miniprogram/src/ 之下。**

### **Step 1: 建立数据契约 (TypeScript 类型定义)**

**Prompt:**

当前我们在 frontend\_miniprogram/ 目录下进行 Uni-app (Vue3+TS) 开发。请在 frontend\_miniprogram/src/types/ 目录下新建 map.d.ts。

定义一个 SamplingPoint 接口，包含以下字段：

1. point\_id: string (唯一标识)  
2. coordinates: { longitude: number, latitude: number }  
3. scene\_description: string (可选)  
4. images: 包含 N, NE, E, SE, S, SW, W, NW 八个可选 string 属性的对象（用于存放本地路径或云端 URL）。  
5. status: 联合类型 'pending' | 'uploading' | 'synced'  
6. timestamp: number (时间戳)

### **Step 2: 编写离线队列管理 (子模块 4.2)**

**Prompt:**

基于刚才定义的 SamplingPoint 类型，在 frontend\_miniprogram/src/services/ 目录下新建 storageService.ts。

编写一个 StorageService 类（导出单例），封装 Uni-app 的本地缓存 API (uni.setStorageSync, uni.getStorageSync)，用于管理离线街景数据队列。

要求实现：

1. STORAGE\_KEY 常量设为 'offline\_sampling\_tasks'。  
2. addTask(point: SamplingPoint): void \- 追加任务并保存。  
3. getPendingTasks(): SamplingPoint\[\] \- 获取所有 status 为 'pending' 的任务。  
4. removeTask(point\_id: string): void \- 移除指定任务。  
5. updateTaskStatus(point\_id: string, status: string): void \- 更新任务状态。

### **Step 3: 编写数据组装工坊 (子模块 4.1)**

**Prompt:**

在 frontend\_miniprogram/src/utils/ 目录下新建 dataAssembler.ts。

编写并导出一个函数 createSamplingPoint(lat: number, lon: number, desc: string, localImages: Record\<string, string\>)。

要求：

1. 自动生成一个基于 'Point\_' \+ 当前时间戳 \+ 4位随机数的 point\_id。  
2. 将传入的参数组装成符合 SamplingPoint 接口规范的对象。  
3. status 默认设置为 'pending'，timestamp 为当前时间。  
4. 处理 localImages 中某些方向可能没有图片的边界情况（保留为空或不放入）。  
5. 组装完成后，直接调用 StorageService.addTask() 将其存入本地离线队列，并返回生成的 point\_id。

### **Step 4: 编写同步引擎与垃圾回收 (子模块 4.3 & 4.4，兼容模块五)**

**Prompt:**

在 frontend\_miniprogram/src/services/ 目录下新建 syncService.ts。这个服务负责将本地离线数据同步到后端的 MongoDB。

编写一个 SyncService 类（导出单例），包含核心方法 syncPendingTasks()。

逻辑要求：

1. 调用 StorageService.getPendingTasks() 获取待上传列表。  
2. 遍历任务，将任务状态更新为 'uploading'。  
3. **难点处理**：因为 uni.uploadFile 只能单文件上传。请为当前任务中所有的本地图片路径使用 Promise.all 并发调用 uni.uploadFile 上传到服务器（假设后端有个 /api/upload/image 接口接收单图并返回 URL）。  
4. **数据契约转换**：获取所有云端 URL 后，替换原有的本地路径。然后通过 uni.request 发送完整的 JSON 数据到后端 /api/upload/sampling\_point。（这样后端模块五就能直接把坐标和云端URL存入 MongoDB 建立 2dsphere 索引了）。  
5. **垃圾回收 (GC)**：如果后端返回 200 成功，调用 StorageService.removeTask() 删除本地记录；并遍历该任务原始的本地临时图片路径，使用 uni.getFileSystemManager().unlink 将物理文件从手机中删除，注意捕获 unlink 的异常。  
6. 如果中途任何一步失败，将任务状态改回 'pending' 等待下次重试。