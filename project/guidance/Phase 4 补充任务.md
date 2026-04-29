### **模块 4.5：大模型 API 密钥服务端固化与可用性探测 (API Key Hardcoding & Model Probing)**

* **背景与目标**：  
  * **痛点 1**：为了提升交互体验，API Key 不应再由前端用户频繁输入。需将其固化到后端配置中，前端仅保留“模型选择”下拉菜单。  
  * **痛点 2**：各大平台（如 Gemini）的部分高级模型普通账号无权限或已限流（如报 429 RESOURCE\_EXHAUSTED 错误）。我们需要一个自动化探测模块，一键测试 Gemini、DeepSeek、阿里云百炼 下的候选模型是否真实可用。  
* **操作文件**：backend/.env, backend/config/llmConfig.js, backend/routes/configRoutes.js, backend/services/modelTester.js (新建)  
* **执行协议**：  
  * **步骤 1：环境变量改造 (backend/.env & llmConfig.js)**  
    * 在 .env 中增加：GEMINI\_API\_KEY, DEEPSEEK\_API\_KEY, BAILIAN\_API\_KEY。  
    * 改造 llmConfig.js：不再接收前端传入的 api\_key。getKey(provider) 方法直接从 process.env 读取对应的环境变量。前端调用配置接口时，只需传递 provider 和 model\_name。  
  * **步骤 2：建立探测服务 (backend/services/modelTester.js)**  
    * 导出一个异步函数：async function probeAvailableModels()  
    * **预设候选名单 (Candidate List)**：  
      * *Gemini*：gemini-3.1-pro-preview, gemini-3-flash-preview, gemini-3.1-flash-lite-preview, gemini-robotics-er-1.5-preview  
      * *DeepSeek*：deepseek-chat, deepseek-coder (注：DeepSeek 若不支持图片，需在此处做纯文本分支判断)  
      * *阿里云百炼 (Qwen)*：qwen-vl-max, qwen-vl-plus  
    * **探测逻辑**：遍历上述名单，使用一个极其简短的测试 Prompt（例如：“请回复OK”；对于多模态模型，可附带一张极小的 Base64 纯色测试图）。使用 Try-Catch 捕获请求。  
    * **返回格式**：收集每个模型的测试结果，输出类似如下结构的报告：  
      {  
        "provider": "gemini",  
        "model": "gemini-3.1-pro-preview",  
        "status": "failed",  
        "error\_message": "429 RESOURCE\_EXHAUSTED"  
      }

  * **步骤 3：暴露探测路由 (backend/routes/configRoutes.js)**  
    * 新增 Endpoint：GET /api/config/llm/probe  
    * 调用 modelTester.probeAvailableModels()，并将包含所有模型成功/失败状态的数组返回给前端。前端随后可根据此接口的数据，动态禁用下拉菜单中那些 status: "failed" 的模型选项。