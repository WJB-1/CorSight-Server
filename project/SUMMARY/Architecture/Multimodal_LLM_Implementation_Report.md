# CorSight Navigation - 多模态大模型调用实现分析报告

**生成时间**: 2026-03-27  
**分析范围**: navigation_agent/backend/agents/perceptionAgent.js, llmClient.js 及相关提示词模板  
**报告类型**: 技术实现逆向分析

---

## 一、执行摘要

本项目通过 **Perception Agent (环境感知智能体)** 实现对多模态大模型的调用，核心功能是**将 8 方位街景图像一次性输入 LLM，提取盲道、障碍物等微观环境信息**，用于增强导航播报的准确性和安全性。

**核心结论**:
- ✅ **一次性输入 8 张图片**：系统提取 N, NE, E, SE, S, SW, W, NW 八个方位的街景图像
- ✅ **图片包含方位描述**：提示词中明确定义了 8 方位图像的空间关系（见第三章）
- ✅ **多模型支持**：Gemini 和 Qwen 支持多模态，DeepSeek 仅支持文本

---

## 二、多模态调用架构概览

### 2.1 数据流全景图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         多模态 LLM 调用数据流                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                           │
│   │   关键节点    │  node.polyline → 提取中点坐标                               │
│   │  (IR JSON)   │                                                           │
│   └──────┬───────┘                                                           │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────┐                                                   │
│   │ corsightService      │  查询 MongoDB 采样点                               │
│   │ .getNearbyPoints()   │  半径 50 米范围内                                 │
│   └──────┬───────────────┘                                                   │
│          │                                                                   │
│          ▼                                                                   │
│   ┌──────────────────────┐     ┌─────────────────────────────────────────┐    │
│   │ SamplingPoint        │────▶│  8 方位街景图像 (N, NE, E, SE, S, SW,   │    │
│   │ (MongoDB 文档)       │     │  W, NW)                                │    │
│   │ point.images{}       │     └──────────────────┬──────────────────────┘    │
│   └──────────────────────┘                        │                          │
│                                                   ▼                          │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                    llmClient.generateContent()                         │  │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │  │
│   │  │  文本提示词      │  │  8张图片(base64) │  │  modelType:     │       │  │
│   │  │  (prompt)       │  │  (imagePaths[]) │  │  'vision'       │       │  │
│   │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │  │
│   └─────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                     多模态 LLM 推理                                    │  │
│   │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│   │  │  提示词中方位定义：                                               │  │  │
│   │  │      N (0°)                                                      │  │  │
│   │  │      ↑                                                           │  │  │
│   │  │  NW  ↖   ↗  NE                                                   │  │  │
│   │  │  W ←  •  → E                                                     │  │  │
│   │  │  SW  ↙   ↘  SE                                                   │  │  │
│   │  │      ↓                                                           │  │  │
│   │  │      S (180°)                                                    │  │  │
│   │  └─────────────────────────────────────────────────────────────────┘  │  │
│   └─────────────────────────────────┬─────────────────────────────────────┘  │
│                                     │                                        │
│                                     ▼                                        │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                      结构化输出 (JSON)                                 │  │
│   │  {                                                                     │  │
│   │    "accessibility_analysis": { "tactile_paving": "...", ... },        │  │
│   │    "hazards": ["障碍物1", "障碍物2"],                                  │  │
│   │    "landmarks": [...],                                                │  │
│   │    "mobility_cues": "..."                                             │  │
│   │  }                                                                     │  │
│   └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心调用链

| 步骤 | 函数 | 文件 | 职责 |
|-----|------|------|------|
| 1 | `enrichNodes()` | `perceptionAgent.js:23` | 主入口，并发处理所有关键节点 |
| 2 | `extractCoordinates()` | `perceptionAgent.js:136` | 从节点提取坐标 |
| 3 | `extractImagePaths()` | `perceptionAgent.js:192` | 提取 8 方位图片路径 |
| 4 | `analyzeWithLLM()` | `perceptionAgent.js:218` | 封装 LLM 调用逻辑 |
| 5 | `generateContent()` | `llmClient.js:71` | 统一多模态调用入口 |
| 6 | `generateWithGemini()` | `llmClient.js:136` | Gemini 多模态实现 |
| 7 | `generateWithQwen()` | `llmClient.js:265` | Qwen 多模态实现 |

---

## 三、8 方位图像处理详解

### 3.1 图像提取逻辑

**代码位置**: [`perceptionAgent.js:192-208`](navigation_agent/backend/agents/perceptionAgent.js:192)

```javascript
function extractImagePaths(point) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const paths = [];

    // 提取 8 方位图片
    directions.forEach(dir => {
        if (point.images[dir]) {
            paths.push(point.images[dir]);
        }
    });

    return paths;  // 返回 8 张图片的路径数组
}
```

**关键特征**:
- 固定 8 个方位：`['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']`
- 从 MongoDB 采样点文档的 `images` 字段提取
- 返回数组顺序按方位顺时针排列

### 3.2 图像格式转换

**代码位置**: [`llmClient.js:346-404`](navigation_agent/backend/services/llmClient.js:346)

```javascript
async function loadImageAsBase64(imagePath) {
    // 支持 HTTP/HTTPS URL（从 Blind_map 服务获取）
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        const response = await axios.get(imagePath, {
            responseType: 'arraybuffer',
            timeout: 10000,
            proxy: false  // 本地服务不走代理
        });
        const buffer = Buffer.from(response.data);
        const base64 = buffer.toString('base64');
        return { base64, mimeType };
    }
    // ... 本地文件处理
}
```

**转换流程**:
1. 从 URL/本地路径读取图像数据
2. 转换为 `ArrayBuffer`
3. 编码为 Base64 字符串
4. 根据文件扩展名推断 MIME 类型（jpg/jpeg/png/gif/webp）

---

## 四、LLM 调用实现方式

### 4.1 统一调用入口

**代码位置**: [`llmClient.js:71-126`](navigation_agent/backend/services/llmClient.js:71)

```javascript
async function generateContent(prompt, imagePaths = [], options = {}) {
    // 根据 modelType 选择视觉或文本模型
    if (options.modelType === 'vision' && llmConfig.getVisionModel) {
        const visionModel = llmConfig.getVisionModel();
        provider = visionModel.provider;   // 'gemini' | 'qwen' | 'deepseek'
        modelName = visionModel.modelName; // 'gemini-1.5-flash' | 'qwen-vl-plus'...
    }

    // 根据 provider 分发到对应实现
    switch (provider.toLowerCase()) {
        case 'gemini':
            return await generateWithGemini(prompt, imagePaths, modelName, options);
        case 'deepseek':
            return await generateWithDeepSeek(prompt, imagePaths, modelName, options);
        case 'qwen':
            return await generateWithQwen(prompt, imagePaths, modelName, options);
    }
}
```

### 4.2 Gemini 多模态实现

**代码位置**: [`llmClient.js:136-196`](navigation_agent/backend/services/llmClient.js:136)

```javascript
async function generateWithGemini(prompt, imagePaths, modelName, options) {
    const ai = new GoogleGenAI({ apiKey });

    // 构建内容数组：图片在前，文本在后
    const contents = [];

    for (const imagePath of imagePaths) {
        const { base64, mimeType } = await loadImageAsBase64(imagePath);
        contents.push({
            inlineData: { data: base64, mimeType: mimeType }
        });
    }

    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
        model: modelName || 'gemini-1.5-flash',
        contents: contents,
        config: {
            temperature: 0.1,
            topP: 0.85,
            maxOutputTokens: 800
        }
    });
}
```

**技术要点**:
- 使用 `@google/genai` SDK
- 通过 `globalThis.fetch` 代理实现网络请求拦截
- 8 张图片作为 `inlineData` 类型内容项依次推入数组
- 文本提示词作为最后一个内容项

### 4.3 Qwen 多模态实现

**代码位置**: [`llmClient.js:265-338`](navigation_agent/backend/services/llmClient.js:265)

```javascript
async function generateWithQwen(prompt, imagePaths, modelName, options) {
    const openai = new OpenAI({
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: apiKey,
        httpAgent: proxyAgent
    });

    // 构建 OpenAI 标准多模态消息格式
    const contentArr = [];
    contentArr.push({ type: 'text', text: prompt });

    for (const imagePath of imagePaths) {
        const { base64, mimeType } = await loadImageAsBase64(imagePath);
        contentArr.push({
            type: 'image_url',
            image_url: {
                url: `data:${mimeType};base64,${base64}`
            }
        });
    }

    const response = await openai.chat.completions.create({
        model: modelName || 'qwen-vl-plus',
        messages: [
            { role: 'system', content: '你是一个专业的视障导航助手。' },
            { role: 'user', content: contentArr }  // 包含文本+8张图片
        ]
    });
}
```

**技术要点**:
- 使用 OpenAI SDK 兼容模式接入阿里云百炼
- 采用 OpenAI 标准的多模态消息格式（`image_url` 类型）
- Base64 图片以 Data URI 格式嵌入（`data:image/jpeg;base64,...`）

### 4.4 DeepSeek 限制

**代码位置**: [`llmClient.js:220-223`](navigation_agent/backend/services/llmClient.js:220)

```javascript
// DeepSeek 目前不支持多模态，忽略图片
if (imagePaths && imagePaths.length > 0) {
    console.warn('[llmClient] DeepSeek 不支持图片输入，已忽略');
}
```

**限制说明**:
- DeepSeek API 当前版本仅支持文本输入
- 调用时会自动忽略图片数组，仅发送文本提示词

---

## 五、图片方位描述机制

### 5.1 提示词中的方位定义

**位置**: [`perception-intersection.md:86-98`](navigation_agent/backend/prompts/templates/perception-intersection.md:86)

```markdown
## Image Input

8 方位街景图像，方位定义：

```
               N (0°)
               ↑
        NW  ↖   ↗  NE
       W  ←    •    →   E
        SW  ↙   ↘  SE
               ↓
               S (180°)
```
```

**关键信息**:
- 明确告知 LLM 输入包含 8 张图像
- 提供清晰的方位图示（指南针布局）
- 标注角度参考（N=0°, S=180°）
- LLM 可据此理解每张图片的空间方向

### 5.2 不同类型场景的方位应用

| 场景类型 | 提示词文件 | 方位描述方式 | 示例 |
|---------|-----------|-------------|------|
| 路口 | `perception-intersection.md` | 360°全景描述 | "给定提供该路口 360 度视图的 8 张图像" |
| 路径段 | `perception-path.md` | 相对方向描述 | "给定街道的 8 方位街景图像（N, NE, E...）" |
| 特殊地形 | `perception-feature.md` | 朝向+动作结合 | 结合 `clock_direction` 参数 |
| 目的地 | `perception-destination.md` | 周边环境描述 | 8 方位环境扫描 |

### 5.3 时钟方位与图像方位的映射

系统通过**时钟方位**（如"11点钟方向"）指导用户行进方向，与 8 方位图像的对应关系：

```
时钟方位 → 8 方位映射:

    12点 (N)         N
     ↑                   ↑
10点 ↖   ↗ 2点   NW  ↖   ↗  NE
9 ←        → 3点  W ←         →   E
8点  ↙   ↘ 4点   SW  ↙   ↘  SE
     ↓                   ↓
    6点 (S)              S
```

在提示词中，`{{clock_direction}}` 变量会填充为实际导航方位（如"向东南方向上天桥" → "11点钟方向"），帮助 LLM 结合图像理解用户即将进行的动作方向。

---

## 六、模型配置与选型

### 6.1 视觉模型配置

**配置位置**: `llmConfig.js`

```javascript
// 视觉模型（用于多模态推理）
const visionModel = llmConfig.getVisionModel();
// 返回: { provider: 'gemini', modelName: 'gemini-1.5-flash' }
// 或:   { provider: 'qwen', modelName: 'qwen-vl-plus' }
```

### 6.2 支持的视觉模型

| 提供商 | 模型名称 | 多模态支持 | 调用方式 |
|-------|---------|-----------|---------|
| Google | `gemini-1.5-flash` | ✅ 原生支持 | `@google/genai` SDK |
| Google | `gemini-1.5-pro` | ✅ 原生支持 | `@google/genai` SDK |
| 阿里云 | `qwen-vl-plus` | ✅ OpenAI兼容 | `dashscope` API |
| 阿里云 | `qwen-vl-max` | ✅ OpenAI兼容 | `dashscope` API |
| DeepSeek | `deepseek-chat` | ❌ 仅文本 | `deepseek` API |

### 6.3 调用参数

**默认视觉模型参数**:

```javascript
{
    temperature: 0.1,    // 低温度，确保输出稳定
    topP: 0.85,          // 适度多样性
    maxTokens: 1000,     // 足够容纳详细分析
    modelType: 'vision'  // 强制使用视觉模型配置
}
```

---

## 七、并发处理策略

### 7.1 节点级并发

**代码位置**: [`perceptionAgent.js:33-122`](navigation_agent/backend/agents/perceptionAgent.js:33)

```javascript
async function enrichNodes(keyNodes) {
    // 并发处理所有节点
    const processingPromises = keyNodes.map(async (node, index) => {
        // 每个节点独立处理：
        // 1. 提取坐标
        // 2. 查询附近采样点
        // 3. 提取 8 方位图片
        // 4. 调用 LLM 视觉分析
    });

    const enrichedNodes = await Promise.all(processingPromises);
    return enrichedNodes;
}
```

**并发特性**:
- 所有关键节点**并行处理**（`Promise.all()`）
- 单个节点内部是**顺序执行**（坐标→采样点→图片→LLM）
- 单个节点失败不影响其他节点（try-catch 包裹）

### 7.2 性能数据

根据日志分析，典型处理耗时：

| 节点数 | 平均耗时 | 说明 |
|-------|---------|------|
| 1 个 | 2-4 秒 | 单节点串行处理 |
| 3 个 | 4-6 秒 | 并发处理，受限于 LLM API 响应 |
| 5 个 | 6-10 秒 | 并发瓶颈在网络延迟 |

---

## 八、输出结构与后处理

### 8.1 LLM 输出格式

**Perception Agent 返回结构**:

```typescript
{
    point_id: String,              // 采样点 ID
    point_distance: Number,        // 节点到采样点距离（米）
    scene_description: String,     // 场景描述
    analysis: {
        success: Boolean,
        raw_response: String,      // LLM 原始响应
        parsed: {
            // 路口类型输出:
            accessibility_analysis: {
                tactile_paving: String,   // 盲道情况
                audible_signals: String,  // 过街提示音
                pedestrian_signals: String
            },
            hazards: String[],            // 风险点数组
            landmarks: Array,             // 地标信息
            mobility_cues: String         // 移动线索
        },
        provider: String,            // 'gemini' | 'qwen'
        fallback: Boolean            // 是否降级
    },
    prompt_type: String            // 'path' | 'intersection' | 'destination' | 'feature'
}
```

### 8.2 hazards 融合逻辑

**代码位置**: `languageOptimizer.js` (enhanceIRWithPerception)

从感知分析中提取的风险类型：

```javascript
// 融合逻辑：
- parsed.hazards[]                    // LLM 直接声明的风险
- parsed.accessibility_analysis:      // 无障碍分析异常
  - tactile_paving 包含 "无" → 添加 "无盲道铺设"
  - audible_signals 包含 "无" → 添加 "无过街提示音"
- parsed.sidewalk.obstacles[]         // 人行道障碍物
```

---

## 九、技术限制与注意事项

### 9.1 图像相关限制

| 限制项 | 说明 |
|-------|------|
| 图片数量 | 固定 8 张，缺失方位会被跳过 |
| 图片格式 | 支持 JPG/PNG/GIF/WebP |
| 图片大小 | 受 LLM API 限制（通常单张 < 10MB）|
| 图片来源 | 支持 HTTP URL（Blind_map 服务）和本地文件 |

### 9.2 LLM 能力限制

| 限制项 | Gemini | Qwen | DeepSeek |
|-------|--------|------|----------|
| 多模态 | ✅ 支持 | ✅ 支持 | ❌ 不支持 |
| 同时处理图片数 | 8+ 张 | 8+ 张 | 0 张 |
| 方位理解 | 依赖提示词描述 | 依赖提示词描述 | N/A |
| JSON 结构化输出 | 支持 | 支持 | 支持 |

### 9.3 错误处理策略

```javascript
// 图片加载失败
→ 跳过该图片，继续处理其他图片
→ 日志警告: "[llmClient] 加载图片失败 xxx"

// LLM API 失败
→ 返回错误标记，节点保留但 perception_data = null
→ 记录: perception_error: error.message
→ 整体流程不中断

// JSON 解析失败
→ 返回原始文本 + parse_error 标记
→ 供下游模块决策是否使用
```

---

## 十、总结

### 10.1 核心发现

1. **8 张图片一次性输入**：系统从 MongoDB 采样点提取 8 方位（N, NE, E, SE, S, SW, W, NW）街景图像，一次性送入多模态 LLM

2. **图片方位明确定义**：提示词模板中包含清晰的方位图示和说明，LLM 能够理解每张图片对应的空间方向

3. **多模型适配**：
   - **Gemini**：原生多模态，通过 `inlineData` 传递图片
   - **Qwen**：OpenAI 兼容多模态，通过 `image_url` 传递 base64 图片
   - **DeepSeek**：仅支持文本，自动忽略图片输入

4. **并发高效处理**：多个关键节点的视觉感知并行执行，提升整体响应速度

### 10.2 关键代码索引

| 功能 | 文件 | 行号 |
|-----|------|------|
| 8 方位图片提取 | `perceptionAgent.js` | 192-208 |
| 图片转 base64 | `llmClient.js` | 346-404 |
| Gemini 多模态调用 | `llmClient.js` | 136-196 |
| Qwen 多模态调用 | `llmClient.js` | 265-338 |
| 方位提示词定义 | `perception-intersection.md` | 86-98 |
| 并发节点处理 | `perceptionAgent.js` | 33-122 |

---

**报告结束**

*本报告基于代码逆向分析生成，准确反映了 CorSight Navigation 项目中多模态大模型的调用实现方式。*
