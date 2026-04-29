# **Phase 4 工作总结报告**

## **📋 阶段概述**

**Phase 4** 是导航预览 Agent 验证 Demo 的"大脑"层开发阶段，核心任务是构建**多智能体感知引擎编排系统**。本阶段将 Phase 3 生成的空间骨架（IR JSON）赋予血肉，通过调度大模型与真实街景图片进行多模态交互，最终生成防范式的导航播报文本。

---

## **🎯 核心目标**

1. **视觉提线木偶 (Perception Agent)**: 遍历 IR 关键节点，调用 LLM 分析 MongoDB 中的 8 方位街景图，提取盲道、障碍物等微观环境细节
2. **语言重构防线 (Language Optimizer Agent)**: 应用"防范式提示词"，强制 LLM 生成标准的三段式盲人导航文本
3. **API 管理优化**: 固化 API Key 到服务端，实现模型可用性自动探测

---

## **📁 交付文件清单**

### **模块 4.1: 提示词工程库搭建 (Prompt Engineering)**

| 文件 | 说明 | 核心功能 |
|------|------|----------|
| `backend/prompts/sceneScoutPrompts.js` | 视觉提取提示词库 | 提供路口/沿途/目的地等不同场景的 SceneScout 提示词 |
| `backend/prompts/defensivePrompts.js` | 防范式约束提示词 | 包含惜字如金、时钟法则、视觉偏见过滤等硬性约束 |

**关键技术点:**
- **绝对约束法则**: 严禁大模型发明方向，必须使用传入的"9点钟方向"等绝对时钟词汇
- **强制输出结构**: "宏观全局概览" + "关键节点时序拆解" + "最后50米盲区策略"三段式
- **视觉偏见过滤**: 禁止"五颜六色"、"看到"等依赖视觉的词汇

---

### **模块 4.2: 统一大模型客户端 (Unified LLM Client)**

| 文件 | 说明 | 核心功能 |
|------|------|----------|
| `backend/services/llmClient.js` | 多模态 LLM 客户端 | 支持 Gemini、DeepSeek、阿里云百炼(Qwen) 的统一调用接口 |

**架构特性:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Unified LLM Client                       │
├─────────────────────────────────────────────────────────────┤
│  Proxy Layer (https-proxy-agent)                            │
│    └── 强制接管全局 fetch，解决网络连通性问题               │
├─────────────────────────────────────────────────────────────┤
│  Provider Adapters                                          │
│    ├── Gemini (@google/genai) - 多模态图文                  │
│    ├── DeepSeek (OpenAI SDK) - 纯文本                       │
│    └── Qwen/Bailian (OpenAI SDK) - 多模态图文               │
├─────────────────────────────────────────────────────────────┤
│  Image Loading                                              │
│    ├── 本地文件路径 → fs.readFile                           │
│    └── HTTP URL → axios 下载 (支持 Blind_map 图片)          │
└─────────────────────────────────────────────────────────────┘
```

**核心 API:**
```javascript
async function generateContent(prompt, imagePaths = [], options = {})
```

**支持的模型:**
- **Gemini**: gemini-2.0-flash, gemini-2.5-pro-exp, gemini-2.5-flash-preview
- **DeepSeek**: deepseek-chat, deepseek-reasoner
- **阿里云百炼**: qwen-vl-plus, qwen-vl-max, qwen3-235b-a22b, kimi-vl-a3b-thinking

---

### **模块 4.3: 环境感知 Agent 调度 (Perception Agents)**

| 文件 | 说明 | 核心功能 |
|------|------|----------|
| `backend/agents/perceptionAgent.js` | 环境感知 Agent | 遍历 IR 节点，调用 LLM 分析街景图片，生成富节点数据 |

**工作流程:**
```
输入: key_nodes[] (来自 Phase 3 IR)
    │
    ▼
遍历每个节点:
    ├─ 提取经纬度
    ├─ 调用 corsightService.getNearbyPoints() 获取 8 方位街景图
    ├─ 根据节点类型选择 sceneScoutPrompts 提示词
    ├─ 调用 llmClient.generateContent(prompt, images)
    └─ 将 LLM 感知结果附加到节点
    │
    ▼
输出: enriched_key_nodes[] (富节点数据)
```

---

### **模块 4.4: 语言优化播报 Agent (Language Optimizer)**

| 文件 | 说明 | 核心功能 |
|------|------|----------|
| `backend/agents/languageOptimizerAgent.js` | 最终语言重构 Agent | 融合所有数据，输出沙盘推演播报文案 |

**工作流程:**
```
输入: enriched IR JSON (含视觉感知数据)
    │
    ▼
组合 defensivePrompts 指令
    │
    ▼
调用 LLM 生成播报文案
    │
    ▼
输出: 格式化自然语言文本
    (宏观概览 + 节点拆解 + 盲区策略)
```

**previewController.js 流水线串联:**
```javascript
// 1. 高德路径规划 (Phase 3)
const rawRoute = await amapService.getWalkingRoute(origin, destination);

// 2. 空间逻辑降噪 (Phase 3)
let irJson = spatialMiddleware.generateIntermediateRepresentation(rawRoute);

// 3. 多智能体环境感知补充 (Phase 4)
irJson.key_nodes = await perceptionAgent.enrichNodes(irJson.key_nodes);

// 4. 语言 Agent 生成最终文案 (Phase 4)
const finalBroadcastText = await languageOptimizerAgent.generateBroadcast(irJson);

// 返回给前端
res.json({ 
    success: true, 
    data: { 
        text: finalBroadcastText, 
        route_summary: irJson.route_summary,
        key_nodes: irJson.key_nodes,
        ir: irJson 
    } 
});
```

---

### **模块 4.5: API 密钥固化与模型探测 (补充任务)**

| 文件 | 说明 | 核心功能 |
|------|------|----------|
| `backend/config/llmConfig.js` | LLM 配置管理 | 从环境变量读取 API Key，管理可用模型列表 |
| `backend/services/modelTester.js` | 模型探测服务 | 自动测试各平台候选模型的可用性 |
| `backend/routes/configRoutes.js` | 配置路由 | 暴露 /api/config/llm/probe 探测接口 |

**环境变量配置 (.env):**
```bash
# LLM API Keys
GEMINI_API_KEY=your_gemini_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
BAILIAN_API_KEY=your_bailian_api_key
```

**候选模型探测名单:**
- **Gemini**: gemini-2.0-flash, gemini-2.5-pro-exp, gemini-2.5-flash-preview
- **DeepSeek**: deepseek-chat, deepseek-reasoner
- **阿里云百炼**: qwen-vl-max, qwen-vl-plus, qwen3-235b-a22b, kimi-vl-a3b-thinking

**探测接口:**
```http
GET /api/config/llm/probe
```

**返回示例:**
```json
{
  "success": true,
  "data": [
    {
      "provider": "gemini",
      "model": "gemini-2.0-flash",
      "status": "success",
      "latency_ms": 1200
    },
    {
      "provider": "bailian",
      "model": "qwen-vl-plus",
      "status": "success",
      "latency_ms": 800
    }
  ]
}
```

---

## **🔧 调试与 Bug 修复记录**

在 Phase 4 开发过程中发现并修复了以下关键问题:

### **1. spatialMiddleware.js - trim() 类型错误**
**问题:** `action.trim is not a function` / `orientation.trim is not a function`
**修复:** 添加类型检查确保值是字符串再调用 trim()
```javascript
// 修复前
if (action && action.trim())

// 修复后
if (action && typeof action === 'string' && action.trim())
```

### **2. previewController.js - 数据结构不匹配**
**问题:** 前端访问 `data.route_summary`，但后端返回 `data.ir.route_summary`
**修复:** 将 IR 核心数据展开到顶层
```javascript
data: {
    route_summary: irJson.route_summary,
    key_nodes: irJson.key_nodes,
    raw_data: irJson.raw_data,
    ir: irJson,  // 保留完整 IR 供需要时使用
    ...
}
```

### **3. llmClient.js - HTTP URL 图片加载失败**
**问题:** Blind_map 返回的图片 URL (`http://localhost:3001/images/xxx.jpg`) 被错误当作本地路径处理
**修复:** `loadImageAsBase64` 函数添加 HTTP URL 支持
```javascript
if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const response = await axios.get(imagePath, {
        responseType: 'arraybuffer',
        timeout: 10000,
        proxy: false  // 本地服务不走代理
    });
    // 转换为 base64
}
```

### **4. llmClient.js - axios 未定义**
**问题:** 修复 HTTP URL 支持后，忘记导入 axios
**修复:** 添加 `const axios = require('axios');`

---

## **📊 系统架构图**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Phase 4 多智能体架构                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐  │
│  │   Frontend UI    │────▶│  Preview API     │────▶│  Amap Service   │  │
│  │  (Phase 2 地图)  │     │  (previewController)    │  (路径规划)      │  │
│  └──────────────────┘     └────────┬─────────┘     └─────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Phase 3: 空间逻辑降噪中间件                     │   │
│  │  spatialMiddleware.generateIntermediateRepresentation()          │   │
│  │  - 关键决策点过滤                                                  │   │
│  │  - 时钟方位计算                                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Phase 4: 多智能体引擎                           │   │
│  │                                                                  │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────────┐      │   │
│  │  │ Perception Agent    │───▶│ - 遍历 key_nodes            │      │   │
│  │  │ (perceptionAgent.js)│    │ - 获取 8 方位街景图         │      │   │
│  │  └─────────────────────┘    │ - LLM 视觉分析              │      │   │
│  │                             │ - 生成富节点数据            │      │   │
│  │                             └─────────────────────────────┘      │   │
│  │                                          │                        │   │
│  │                                          ▼                        │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────────┐      │   │
│  │  │ Language Optimizer  │◄───│ enriched IR JSON            │      │   │
│  │  │(languageOptimizer   │    │ (含视觉感知数据)            │      │   │
│  │  │      Agent.js)      │    └─────────────────────────────┘      │   │
│  │  └─────────────────────┘                                         │   │
│  │           │                                                      │   │
│  │           ▼                                                      │   │
│  │  ┌─────────────────────┐                                         │   │
│  │  │ Defensive Prompts   │ 防范式约束                              │   │
│  │  │(defensivePrompts.js)│ - 惜字如金                              │   │
│  │  └─────────────────────┘ - 时钟法则                               │   │
│  │                          - 视觉偏见过滤                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Unified LLM Client                            │   │
│  │                                                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │   Gemini    │  │  DeepSeek   │  │  阿里云百炼 (Qwen)      │   │   │
│  │  │  (Google)   │  │  (OpenAI)   │  │  (OpenAI Compatible)    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  │                                                                  │   │
│  │  Proxy: https-proxy-agent (解决网络连通性问题)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         输出层                                    │   │
│  │  - text: 最终播报文案                                             │   │
│  │  - route_summary: 路线概览                                        │   │
│  │  - key_nodes: 富节点数据                                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## **🚀 下一步工作 (Phase 5 展望)**

Phase 5 将专注于**前端 TTS 语音播报**与**用户体验优化**:

1. **TTS 语音引擎集成**: 将 Phase 4 生成的播报文本转换为语音
2. **播报节奏控制**: 实现可暂停、可跳过的播报控制面板
3. **沙盘古可视化**: 在地图上可视化显示当前播报对应的关键节点
4. **移动端适配**: 针对视障用户的无障碍交互优化

---

## **📁 相关文档索引**

- [Phase 4 开发指导文档](./Phase%204%E5%BC%80%E5%8F%91%E6%8C%87%E5%AF%BC%E6%96%87%E6%A1%A3.md) - 详细开发规范
- [Phase 4 补充任务](./Phase%204%20%E8%A1%A5%E5%85%85%E4%BB%BB%E5%8A%A1.md) - API Key 固化和模型探测
- [导航路线行前语音预览POC方案](./%E5%AF%BC%E8%88%AA%E8%B7%AF%E7%BA%BF%E8%A1%8C%E5%89%8D%E8%AF%AD%E9%9F%B3%E9%A2%84%E8%A7%88POC%E6%96%B9%E6%A1%88.md) - 产品核心设计哲学
- [SceneScout 提示词整理](./SceneScout_%E6%8F%90%E7%A4%BA%E8%AF%8D%E4%B8%AD%E6%96%87%E6%95%B4%E7%90%86.md) - 视觉提取提示词参考
- [LLM大模型API统一接入规范](./LLM%E5%A4%A7%E6%A8%A1%E5%9E%8BAPI%E7%BB%9F%E4%B8%80%E6%8E%A5%E5%85%A5%E8%A7%84%E8%8C%83%E4%B8%8E%E4%BF%AE%E5%A4%8D%E6%8C%87%E5%8D%97(%E8%87%B4Agent).md) - 网络代理配置指南

---

**文档版本**: 1.0  
**创建日期**: 2026-03-25  
**作者**: CorSight Navigation Team
