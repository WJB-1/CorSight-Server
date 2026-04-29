# **CorSight Navigation \- 架构逆向工程与分析工作流 (AI Agent Guidance)**

**\[系统指令：致正在读取本文档的 AI Agent\]**

你好，AI。当你读取到这份文档时，请立即切换为**资深后端架构师**与**代码审计员**的角色。

你的任务是全面扫描当前工作区中的 CorSight Navigation 项目，逆向工程出其 API 契约和内部模块通信流。

**执行规则：**

1. 请不要一次性输出所有乱七八糟的内容。请**严格按照以下三个阶段（Task 1 \-\> Task 2 \-\> Task 3）顺序执行**。  
2. 请将你的最终分析结果统一整理，并在项目根目录生成一份名为 Architecture\_API\_Report.md 的报告文件。  
3. 在分析代码时，切勿被繁琐的业务逻辑细节带偏，请死死盯住\*\*“输入、输出、数据结构、模块边界”\*\*。

## **🌍 项目全局上下文 (Context)**

*在开始扫描代码前，请先理解当前项目的业务背景：*

* **项目名称**：CorSight Navigation（视障语义地图导航预览系统）  
* **技术栈**：Express.js (后端) \+ Vite/Vanilla JS (前端) \+ 多模态大模型 (Gemini/DeepSeek)。  
* **核心业务流**：前端请求 \-\> 高德路线规划 \-\> 空间降噪中间件 (Spatial MW) \-\> 街景环境感知 (PerceptionAgent，视觉多模态) \-\> 语言优化与播报生成 (LanguageOptimizer，文本 LLM) \-\> 返回给前端播放。

## **🛠️ Task 1: 梳理路由骨架 (The Routing Skeleton)**

**动作指令**：

请全局扫描 backend/routes/ 目录下的所有文件（如 configRoutes.js, mapRoutes.js, navigationRoutes.js）以及 backend/server.js。

**输出要求**：

在生成的报告中创建第一章《全景 API 路由表》。

使用 Markdown 表格列出所有对外的 RESTful API 路由。必须包含以下列：

1. **HTTP Method & 路由路径** (例如：POST /api/navigation/preview)  
2. **Controller 映射** (例如：previewController.generatePreview)  
3. **业务用途简述** (一句话概括，不要深入逻辑)

## **🛠️ Task 2: 提取核心 API 契约 (The API Contracts)**

**动作指令**：

重点深度分析 backend/controllers/previewController.js 和 backend/routes/navigationRoutes.js，找出生成导航推演播报的核心接口。

**输出要求**：

在生成的报告中创建第二章《核心 API 契约》。针对预览播报接口，提取严格的 JSON 结构规范：

1. **Request Payload (请求体)**：列出前端需要传过来的所有字段（如起点、终点、LLM配置等），明确数据类型（String/Number/Array/Object）和是否必填。  
2. **Response Payload (响应体)**：精确描述成功返回的 JSON 结构，特别是深层嵌套的对象（如路线节点数组、播报文案等）。  
3. **Error Responses (错误响应)**：可能触发的 HTTP 状态码及错误信息结构。

*(注意：如果 JavaScript 代码中没有明确的类型定义，请根据解构赋值、变量传递和默认值进行逻辑推断。推断的类型请标注 (推断)。)*

## **🛠️ Task 3: 绘制内部模块通信流 (Internal Module Communication)**

**动作指令**：

外部 API 理清后，现在进入后端内部。请深度分析以下三个核心文件的交互逻辑与数据流转：

* backend/middleware/spatialMiddleware.js  
* backend/agents/perceptionAgent.js  
* backend/agents/languageOptimizerAgent.js

**输出要求**：

在生成的报告中创建第三章《核心业务链路与内部数据流》。请详细说明：

1. **执行链路**：当请求进入 previewController 后，这三个模块的先后调用顺序是什么？是同步还是异步并发？  
2. **结构交接 (最关键)**：  
   * spatialMiddleware 处理完毕后，传递给下游的中间数据结构是什么样的？  
   * PerceptionAgent (感知 Agent) 分析图片后，输出的 JSON 数据结构是什么？  
   * LanguageOptimizerAgent (语言优化 Agent) 接收到的完整输入 Payload 长什么样？  
3. **隐式依赖与副作用**：请审查这条链路中，是否存在任何全局状态共享，或者直接修改入参对象（如 req 对象附加属性）的隐式行为？如果有，请明确列出。

**\[系统指令：完成确认\]**

执行完上述所有 Task 后，请立刻生成 Architecture\_API\_Report.md。生成完毕后，向用户回复：“架构分析工作流已执行完毕，报告已生成。”