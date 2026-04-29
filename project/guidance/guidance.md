**Python 可以调用成功，但 JS 调用失败的核心原因是：两者使用的模型名称（modelName）不同，且 Gemini 的免费阶层配额是按具体模型独立计算的。**

### 1. Python 测试脚本明确测试了多个模型，结果很清楚（见你提供的 `gemini_multimodal_test_results.txt` 和 `output.md`）
- **失败的只有 1 个**：`gemini-3.1-pro-preview` → 报 `429 RESOURCE_EXHAUSTED`（免费阶层配额用完，具体是该模型的 requests 和 input tokens 限额）。
- **成功的 3 个**：
  - `gemini-3-flash-preview`
  - `gemini-3.1-flash-lite-preview`
  - `gemini-robotics-er-1.5-preview`

这些都是 2026 年最新的 Gemini 3.x Preview 模型，只有**新版 SDK（google.genai / @google/genai）**才支持，旧的 `@google/generative-ai` 已经废弃。

### 2. JS 端（llmClient.js）使用的模型很可能就是那个失败的
```js
const modelName = activeConfig?.modelName || 'gemini-1.5-flash';
```
- `activeConfig` 来自 `getActiveModel()`（即 `../config/llmConfig` 里的配置）。
- 你项目的 `.env` 里同时写了多个 `gemini-*` 模型（Python 的 `get_all_gemini_models` 会从注释里抓所有）。
- **最可能的情况**：llmConfig 当前激活的就是 `gemini-3.1-pro-preview`（或你手动设成了它），于是 JS 一调用就直接撞上和 Python 测试里一样的 429 配额错误。

而 Python 测试脚本是**把 .env 里所有模型都跑一遍**，所以能看到“有 3 个能用”。

### 3. 其他次要差异（不是根本原因，但也要注意）
- **SDK 完全一致**：JS 用的是官方新版 `@google/genai`（`new GoogleGenAI({ apiKey })` + `ai.models.generateContent`），和 Python 的 `google.genai.Client` 是同一个新统一 SDK，API 完全对齐（包括 `contents` 直接传 Part 数组）。
- **图片格式**：JS 用 `inlineData` + base64，Python 用 `Part.from_bytes`，底层 JSON 一样，没问题。
- **代理**：JS 强制接管了 `globalThis.fetch` + `HttpsProxyAgent`，Python 测试是直连（Windows 本地跑）。但既然 Python 能成功，说明你的 API Key 和网络本身没问题，JS 的代理配置大概率也没问题。

### 快速修复方案
1. **立即切换模型**（推荐）：
   在 `llmConfig` 或 `.env` 里把当前激活的 Gemini 模型改成下面任意一个**已验证可用的**：
   - `gemini-3-flash-preview`
   - `gemini-3.1-flash-lite-preview`
   - `gemini-robotics-er-1.5-preview`

2. 如果你想继续用 pro 系列：
   - 升级到付费计划（Google AI Studio / Vertex AI），或者等免费配额重置（通常每天/每分钟重置）。
   - 或者把 `gemini-3.1-pro-preview` 临时换成上面任意 flash 模型用于测试。

3. 重启 Node 服务后，再调用一次 `generateContent` 测试即可。

这样改完，JS 就能和 Python 测试里那 3 个成功的模型完全一样跑通了（包括你那张上海秋季街景 `test.png` 的多模态分析）。

需要我帮你看一下 `llmConfig.js` 的具体内容，或者给你改好的代码片段吗？直接贴过来就行。