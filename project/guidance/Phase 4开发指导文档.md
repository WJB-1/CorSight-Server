# **导航预览 Agent 验证 Demo \- 开发指导手册 (Phase 4\)**

## **🤖 角色与系统指令 (System Prompt)**

你是一个**高级 Node.js AI 工程师**与**多智能体架构师**。我们正在开发一个用于“视障语义地图”导航的验证 Demo (POC)。

**当前任务阶段：Phase 4（多智能体感知引擎编排）。**

这是整个系统的“大脑”层，你需要将 Phase 3 降噪后的空间骨架（IR JSON）赋予血肉，通过调度大模型与真实街景图片进行多模态交互，并最终生成防范式的导航播报文本。

在编写代码前，请必须仔细阅读本指南。**请严格按照文档末尾的『执行步骤』逐步实现，【绝对禁止】跨越模块边界修改未授权的文件。**

## **🏗️ 第一部分：工程架构与 Phase 4 定位 (Architecture Context)**

为了让你了解当前模块在整个流水线中的位置：

1. **输入源**：Phase 3 空间逻辑中间件生成的纯净 key\_nodes (IR JSON)。  
2. **处理链路（Phase 4 当前任务）**：  
   * **视觉提线木偶 (Perception Agent)**：遍历 IR JSON 中的关键节点，调用底层接口拉取 MongoDB 中的对应 8 方位街景图，结合 SceneScout 提示词，送入 LLM 提取盲道、障碍物等微观环境细节。  
   * **语言重构防线 (Language Optimizer Agent)**：将补充了环境细节的完整节点数据汇总，施加最严厉的“防范式提示词 (Defensive Prompts)”，强制 LLM 生成标准的三段式盲人导航文本。  
3. **输出去向**：更新 previewController.js 流水线，将最终的自然语言播报文案作为 Response 返回给前端（Phase 5 将由前端进行 TTS 语音播报）。

## **🚧 第二部分：Phase 4 工作目录与任务约束**

### **📁 工作目录限制 (Directory Constraints)**

在此阶段，你 **仅允许** 在 backend/ 目录下创建或修改以下特定文件。**绝对禁止修改前端代码，也无需修改 Phase 1-3 已经写好的底层服务机制：**

* backend/services/llmClient.js (新建，多模态 LLM 客户端)  
* backend/prompts/sceneScoutPrompts.js (新建，视觉提取提示词)  
* backend/prompts/defensivePrompts.js (新建，语言防范式约束)  
* backend/agents/perceptionAgent.js (新建，环境感知 Agent)  
* backend/agents/languageOptimizerAgent.js (新建，最终语言重构 Agent)  
* backend/controllers/previewController.js (修改，串联主路由)

## **🛠️ 第三部分：任务模块拆解与具体协议 (Phase 4 Detailed Tasks)**

### **模块 4.1：提示词工程库搭建 (Prompt Engineering)**

* **目标**：将 POC 方案中的核心提示词体系代码化。  
* **操作文件**：backend/prompts/sceneScoutPrompts.js, backend/prompts/defensivePrompts.js  
* **代码协议**：  
  * **参考资料定位**：请严格参考项目内的 navigation\_agent\\project\\SceneScout\_提示词中文整理.md 以及 navigation\_agent\\project\\导航路线行前语音预览POC方案.md。  
  * sceneScoutPrompts.js：需导出不同场景的视觉提取提示词函数。例如 getIntersectionPrompt() (提取路口特征)、getPathPrompt() (提取沿途特征)，引导 LLM 以 JSON 格式输出感知到的障碍物或标志物。  
  * defensivePrompts.js：必须导出绝对严格的防范式提示词，包含两项核心硬性要求：  
    1. **绝对约束法则**：惜字如金、纯粹时钟法则（严禁大模型自己发明方向，必须使用传入的 9点钟方向 等绝对词汇）、严禁视觉偏见词汇（如“五颜六色”）。  
    2. **强制输出结构**：必须输出“宏观全局概览”、“关键节点时序拆解”、“最后 50 米盲区策略”三段式结构。

### **模块 4.2：统一大模型客户端 (Unified LLM Client)**

* **目标**：动态调用 Google Gemini 或阿里云 Qwen 接口，支持多模态（图文）输入，并具备极强的容错机制。  
* **操作文件**：backend/services/llmClient.js  
* **接口协议**：  
  * **导出核心函数**：async function generateContent(prompt, imagePaths \= \[\])  
  * **内部逻辑**：从 llmConfig.js 读取当前的 provider 和 apiKey。优先实现 gemini 的集成，预留 qwen 分支。  
  * **Gemini SDK 规范**：使用 @google/genai 或 google.generativeai SDK 时，必须正确处理图片传入。读取本地图片文件（通过 File API 或 Base64 转码），以 inlineData 的形式与文本 prompt 组合成 contents 数组发送。  
  * **容错底线**：必须加 Try-Catch！如果 LLM 调用超时、失败或 Key 无效，必须返回特定的兜底标识或降级空数据，**绝不能让 Node.js 服务崩溃**。

### **模块 4.3：环境感知 Agent 调度 (Perception Agents)**

* **目标**：调度 LLM 分析街景，填补 Phase 3 的宏观骨架。  
* **操作文件**：backend/agents/perceptionAgent.js  
* **执行协议**：  
  * 导出一个异步函数，接收 Phase 3 的 key\_nodes 数组。  
  * 遍历每个节点：  
    1. 提取节点的经纬度，调用 corsightService.getNearbyPoints() 获取该节点在 MongoDB 中的 8 方位街景图路径。  
    2. 根据节点类型（判断 action 是否包含路口等关键词），选择 sceneScoutPrompts.js 中相应的提示词。  
    3. 将提示词 \+ 图片路径送入 llmClient.generateContent()。  
    4. 将 LLM 返回的感知结果（如微观障碍物）**附加 (Append)** 到当前的 key\_node 对象中，形成富节点数据（Rich Nodes）。  
  * 返回强化后的完整 key\_nodes 数组。

### **模块 4.4：语言优化播报 Agent 与流水线闭环 (Language Optimizer)**

* **目标**：融合所有数据，输出最终的沙盘推演播报文案。  
* **操作文件**：backend/agents/languageOptimizerAgent.js, backend/controllers/previewController.js  
* **执行协议**：  
  * languageOptimizerAgent.js 接收强化后的完整 IR JSON。  
  * 组合 defensivePrompts.js 的指令，发送给 LLM。要求 LLM 必须且只能输出最终的结构化自然语言播报词（无需返回 JSON，直接返回格式化的字符串）。  
  * **修改 previewController.js 的主流水线**，使其变为：  
    // 1\. 高德路径规划 (Phase 3\)  
    const rawRoute \= await amapService.getWalkingRoute(origin, destination);  
    // 2\. 空间逻辑降噪 (Phase 3\)  
    let irJson \= spatialMiddleware.generateIntermediateRepresentation(rawRoute);  
    // 3\. 多智能体环境感知补充 (Phase 4\)  
    irJson.key\_nodes \= await perceptionAgent.enrichNodes(irJson.key\_nodes);  
    // 4\. 语言 Agent 生成最终文案 (Phase 4\)  
    const finalBroadcastText \= await languageOptimizerAgent.generateBroadcast(irJson);

    // 返回给前端  
    res.json({ success: true, data: { text: finalBroadcastText, ir: irJson } });

## **👣 你的执行步骤 (Action Plan)**

请**严格按照以下步骤顺序**向我提供代码。每完成一个步骤，请等待我的确认后，再进行下一步：

1. **执行 4.1**：提供 backend/prompts/sceneScoutPrompts.js 和 backend/prompts/defensivePrompts.js，向我展示你的提示词设计是否足够严谨。  
2. **执行 4.2**：提供 backend/services/llmClient.js。请重点展示对 Gemini SDK 多模态图片上传 inlineData 结构的处理代码以及 Try-Catch 容错机制。  
3. **执行 4.3**：提供 backend/agents/perceptionAgent.js 的实现代码。  
4. **执行 4.4**：提供 backend/agents/languageOptimizerAgent.js 的代码，并展示你是如何修改 backend/controllers/previewController.js 串联起整个 1-4 阶段的。