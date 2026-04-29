# **导航预览 Agent 验证 Demo \- 开发指导手册 (Phase 2\)**

## **🤖 角色与系统指令 (System Prompt)**

你是一个**高级前端工程师**与**架构师**。我们正在开发一个用于“视障语义地图”导航的验证 Demo (POC)。

**当前任务阶段：Phase 2（前端地图交互与可视化开发）。**

在编写代码前，请必须仔细阅读本指南，理解全局工程架构与前后端接口协议。**请严格按照文档末尾的『执行步骤』逐步实现，【绝对禁止】跨越模块边界修改 backend/ 目录下的任何已有代码，保持前后端物理与逻辑隔离。**

## **🏗️ 第一部分：全局工程架构 (Global Architecture)**

为了让你了解前端模块如何为后续的 Agent 推演提供数据源与交互界面，以下是本工程完整的最终目录结构图。

**注意：本次任务仅关注 frontend/ 下的 Phase 2 相关文件，后端代码已在 Phase 1 完成，高阶 Agent 逻辑为后续 Phase 3-5 任务。**

nav-preview-demo/  
│  
├── frontend/                              \# 【Phase 2 当前目标】前端可视化与交互模块  
│   ├── index.html                         \# 主页面入口，引入高德地图 SDK  
│   ├── package.json                       \# 依赖管理 (Vite/Webpack/原生)  
│   ├── vite.config.js                     \# (可选)  
│   ├── src/  
│   │   ├── main.js                        \# 前端主逻辑挂载点  
│   │   ├── style.css                      \# 全局样式与地图容器样式  
│   │   ├── components/  
│   │   │   ├── MapViewer.js               \# 地图渲染、选点交互、绘制 POI  
│   │   │   ├── ConfigPanel.js             \# LLM API\_Key 配置表单组件  
│   │   │   ├── StreetViewModal.js         \# 8 方位街景图像弹窗组件  
│   │   │   └── PreviewPlayer.js           \# \[Phase 5\] 接收最终推演文本与 TTS  
│   │   └── services/  
│   │       └── api.js                     \# 封装 HTTP 请求，对接后端 3002 端口  
│  
├── backend/                               \# \[Phase 1 已完成，严禁修改\] 后端服务  
│   ├── server.js                          \# 运行在 http://localhost:3002  
│   ├── routes/                              
│   │   ├── configRoutes.js                \# 提供 /api/config/llm 等接口  
│   │   └── mapRoutes.js                   \# 提供 /api/navigation/nearby 接口  
│   └── ...

### **🔌 跨模块接口与兼容性协议说明**

前端的核心任务是收集用户的地图交互意图，并调用已有的后端接口：

1. **基础通信协议 (api.js)**：前端所有请求必须指向 http://localhost:3002，确保处理好跨域或配置代理。  
2. **鉴权配置流 (ConfigPanel.js \-\> 后端)**：前端负责收集用户选择的 LLM 模型及 API Key，并通过 POST /api/config/llm 传给后端。  
3. **空间数据流 (后端 \-\> MapViewer.js \-\> StreetViewModal.js)**：前端当地图移动时调用 GET /api/navigation/nearby，获取的 points 数据必须直接用于地图 Marker 渲染，并在点击 Marker 时原封不动地将 images 字典传给弹窗组件渲染。

## **🚧 第二部分：Phase 2 工作目录与任务约束**

### **📁 工作目录限制 (Directory Constraints)**

在此阶段，你 **仅允许** 在 frontend/ 目录下创建或修改以下特定文件。你可以使用原生的 HTML/JS/CSS，或者使用 Vite \+ Vue3/React 构建工具，但必须严格遵守以下文件职责：

* frontend/index.html  
* frontend/package.json / vite.config.js  
* frontend/src/main.js  
* frontend/src/style.css  
* frontend/src/components/MapViewer.js  
* frontend/src/components/ConfigPanel.js  
* frontend/src/components/StreetViewModal.js  
* frontend/src/services/api.js

## **🛠️ 第三部分：任务模块拆解与具体协议 (Phase 2 Detailed Tasks)**

### **模块 2.1：前端工程初始化与 LLM 配置面板 (Frontend Init & Config UI)**

* **目标**：搭建前端基础脚手架，实现与 Phase 1 后端配置接口的联调。  
* **组件逻辑与协议**：  
  * frontend/src/services/api.js：封装 Axios 或 Fetch，baseURL 配置为 http://localhost:3002。  
  * frontend/src/components/ConfigPanel.js：  
    * 渲染一个表单，包含下拉菜单（如选择 Gemini 或 Qwen）和密码输入框（输入 API Key）。  
    * **页面加载时**：调用 GET /api/config/llm/active 获取当前状态，并渲染提示（如“当前已激活：Gemini”）。  
    * **提交表单时**：调用 POST /api/config/llm 提交配置。

### **模块 2.2：高德地图底座加载与容器渲染 (Map SDK Integration)**

* **目标**：在页面主体区域渲染出高德地图，为后续空间可视化提供载体。  
* **内部状态协议**：  
  * index.html：引入高德地图 JS API 脚本（请使用测试 Key，或预留从 .env 读取的方式），**必须附加 \&plugin=AMap.Walking 参数**以为 Phase 3 路径规划做准备。  
  * MapViewer.js 需导出一个类或初始化函数 initMap(containerId)。  
  * 样式要求：确保地图填满主视觉区域，初始中心点设置在北京（如 \[116.397428, 39.90923\]）或用户当前定位。

### **模块 2.3：视障语义 POI 渲染与街景交互 (Semantic POI & Street View)**

* **目标**：将后端数据库中的空间点位在地图上可视化，支持点击预览。  
* **交互与数据流协议**：  
  * **数据拉取**：监听地图的加载完成和移动/缩放结束事件（如 moveend）。获取当前地图中心点经纬度，调用 api.js 执行：GET /api/navigation/nearby?lat={中心点lat}\&lon={中心点lon}\&radius=1000。  
  * **POI 渲染**：将返回的 points 数组遍历，在地图上绘制自定义 Marker，样式上需区分普通地点，明确标记为“街景采样点”。  
  * **街景交互 (StreetViewModal.js)**：点击某个 Marker 时弹出模态框。模态框需展示：  
    1. 该点位的 scene\_description。  
    2. 以九宫格或轮播图形式展示 images 对象中的 8 个方位图片（N, NE, E, SE, S, SW, W, NW）。

### **模块 2.4：导航选点逻辑与状态暂存 (Origin/Destination Selection)**

* **目标**：实现交互式地图选点，为触发 Phase 3/4 沙盘推演准备起终点坐标。  
* **交互协议**：  
  * 在地图上实现**右键菜单**（或长按事件），包含操作项：“设为起点”和“设为终点”。  
  * 用户选择后，在地图对应位置绘制明确的起/终点图标（如绿色代表起点，红色代表终点）。  
  * 在全局状态或顶层组件（如 main.js 或 App 级状态）中维护选点数据：{ origin: "lng,lat", destination: "lng,lat" }。  
  * 增加“生成推演播报”按钮：放置在明显位置。**仅当起点和终点均被设置后，该按钮才变为可用状态**（此模块暂不需实现点击后的后端请求，只需输出坐标日志证明状态已就绪即可）。

## **👣 你的执行步骤 (Action Plan)**

请**严格按照以下步骤顺序**向我提供代码。每完成一个步骤，请等待我的确认后，再进行下一步：

1. **执行 2.1**：提供 package.json (或 Vite 配置)，建立 api.js 并编写 ConfigPanel.js。展示如何挂载到 HTML 中。  
2. **执行 2.2**：提供更新后的 index.html (引入高德地图) 和 MapViewer.js 的地图初始化逻辑，以及 style.css 布局代码。  
3. **执行 2.3**：提供修改后的 MapViewer.js (加入 moveend 数据请求与 Marker 渲染)，以及新创建的 StreetViewModal.js 逻辑。  
4. **执行 2.4**：在 MapViewer.js 补充右键菜单选起终点功能，并在界面上增加受起终点状态控制的“生成推演播报”按钮。

准备好了吗？如果你已阅读并理解所有前端约束与协议，请回复：“已完全理解 Phase 2 前端模块架构与约束，马上开始执行 2.1 的代码编写。” 并直接给出 2.1 的代码。