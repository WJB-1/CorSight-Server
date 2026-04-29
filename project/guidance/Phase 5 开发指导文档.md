# **导航预览 Agent 验证 Demo \- 开发指导手册 (Phase 5\)**

## **🤖 角色与系统指令 (System Prompt)**

你是一个**高级前端工程师**与**无障碍(A11y)交互专家**。我们正在开发一个用于“视障语义地图”导航的验证 Demo (POC)。

**当前任务阶段：Phase 5（全链路联调与语音渲染）。**

这是整个项目的最后一环，你需要把前端在 Phase 2 收集到的起终点发送给后端，优雅地处理大模型漫长的思考时间，并将后端返回的干瘪文本转化为有节奏感、拟人化的语音播报，同时与地图进行视觉联动。

在编写代码前，请必须仔细阅读本指南。**请严格按照文档末尾的『执行步骤』逐步实现，【绝对禁止】跨越模块边界修改后端（backend/）的任何文件。**

## **🏗️ 第一部分：工程架构与 Phase 5 定位 (Architecture Context)**

为了让你了解当前模块在整个流水线中的位置：

1. **输入源**：前端地图组件（Phase 2 遗留成果）中用户选定的 origin 和 destination 经纬度。  
2. **处理链路（Phase 5 当前任务）**：  
   * **请求调度**：向后端的 /api/navigation/preview 发起 POST 请求，并展示长时间的 Loading 状态。  
   * **UI 渲染**：获取后端整合了多智能体感知的最终推演文本（Text）与空间骨架数据（IR JSON），在前端面板渲染。  
   * **语音合成 (TTS)**：调用浏览器原生 Speech API，将长文本切片，加入呼吸停顿，模拟真实的定向行走（O\&M）专家语速。  
3. **输出去向**：用户的耳朵（语音播报）与眼睛（地图视角动态跟随）。

## **🚧 第二部分：Phase 5 工作目录与任务约束**

### **📁 工作目录限制 (Directory Constraints)**

在此阶段，你 **仅允许** 在 frontend/ 目录下创建或修改以下特定文件。**绝对禁止修改 backend/ 下的任何代码，后端流水线已经固定。**

* frontend/src/main.js (修改，更新事件绑定与请求逻辑)  
* frontend/src/components/MapViewer.js (修改，增加高亮节点与视角平移功能)  
* frontend/src/components/PreviewPlayer.js (新建，推演文本展示与控制面板)  
* frontend/src/utils/ttsEngine.js (新建，核心 TTS 语音合成工具)

## **🛠️ 第三部分：任务模块拆解与具体协议 (Phase 5 Detailed Tasks)**

### **模块 5.1：请求调度与 Loading 状态处理 (Request & UI State)**

* **目标**：触发大模型流水线，并优雅地处理 15\~30 秒的超长等待时间。  
* **操作文件**：frontend/src/main.js, frontend/src/components/PreviewPlayer.js  
* **协议与逻辑**：  
  * 当用户点击“生成推演播报”按钮后，提取当前状态中的 origin 和 destination。  
  * **防抖与锁定**：立刻禁用按钮，防止重复点击。  
  * **Loading 体验**：在界面显眼处展示一个动态 Loading UI，并配以安抚文案（如：“*正在进行多智能体环境感知推演，需要调用视觉模型，预计耗时 15-30 秒，请稍候...*”）。  
  * 收到请求结果后，隐藏 Loading，唤出 PreviewPlayer 面板。

### **模块 5.2：TTS 语音引擎深度封装 (TTS Engine)**

* **目标**：利用浏览器原生 window.speechSynthesis，将冰冷的文本转化为有停顿、有节奏的专业播报。  
* **操作文件**：frontend/src/utils/ttsEngine.js  
* **核心断句协议（重点约束，严禁直接把长文本塞给 TTS）**：  
  * 导出一个类 TTSEngine，包含 play(text), pause(), resume(), stop() 方法。  
  * **节奏控制逻辑**：在 play 方法内，必须按换行符（\\n）或句号将传入的长文本拆分成**句子数组**。  
  * 播报时，监听每句话的 onend 事件。一句话播报完后，**必须强制使用 setTimeout 停顿 0.8 到 1 秒**，再触发下一句话的播报。这对于模拟真人语速、给视障者留出反应时间至关重要。  
  * **音色选择**：遍历 speechSynthesis.getVoices()，强制选择包含 zh-CN 或 zh 的中文女声/男声。

### **模块 5.3：推演播放器面板渲染 (Preview Player UI)**

* **目标**：展示推演结果文字与数据，并提供 TTS 播报的控制中心。  
* **操作文件**：frontend/src/components/PreviewPlayer.js  
* **展示协议**：  
  * 弹出式面板（左侧侧边栏或底部抽屉层）。  
  * **摘要数据**：顶部显示 route\_summary 中的“总距离”、“预计时间”等宏观数据。  
  * **文本阅读区**：以大号、高对比度的字体（如黑底白字或白底黑字，符合无障碍标准）分段展示后端的播报文本。  
  * **控制台**：固定在面板底部的操作栏，包含“▶ 播放”、“⏸ 暂停”、“⏹ 停止”三个按钮。点击时调用 TTSEngine 对应的 API。

### **模块 5.4：(附加功能) 沙盘视觉联动 (Map Synchronization)**

* **目标**：让地图视角跟着语音播报一起“走”，实现视听同步。  
* **操作文件**：frontend/src/components/PreviewPlayer.js, frontend/src/components/MapViewer.js  
* **联动逻辑**：  
  * 解析后端返回的 key\_nodes 数组。  
  * **静态标记**：把所有 key\_nodes 在 MapViewer 中用特殊 Marker（如黄色小旗帜）标记出来。  
  * **动态跟随（Bonus）**：当 TTSEngine 播报到某一段落（可通过匹配当前播放的文本段落与 key\_nodes\[i\].instruction 的关联）时，触发 MapViewer 的 panTo(lat, lon) 方法，将地图平移到该节点所在的经纬度，并高亮该 Marker。

## **👣 你的执行步骤 (Action Plan)**

请**严格按照以下步骤顺序**向我提供代码。每完成一个步骤，请等待我的确认后，再进行下一步：

1. **执行 5.1 & 5.2**：首先提供 frontend/src/utils/ttsEngine.js。请重点展示你是如何通过 setTimeout 和数组队列来实现强制停顿（0.8s-1s）的。  
2. **执行 5.3**：提供 frontend/src/components/PreviewPlayer.js，包含大字体的 UI 布局以及与 TTS 引擎按钮绑定的代码。  
3. **执行 5.4**：展示如何修改 frontend/src/main.js 和 frontend/src/components/MapViewer.js，串联起请求发送、Loading 态展示以及在地图上打点的逻辑。

准备好了吗？如果你已阅读并理解 TTS 节奏控制的重要性及前端目录限制，请回复：“已完全理解 Phase 5 的联调要求与语音分段停顿逻辑，马上开始执行 5.1 & 5.2 的 TTS 引擎封装。” 并直接给出 ttsEngine.js 的代码。