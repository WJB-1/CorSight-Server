# CorSight Navigation - 架构逆向工程与 API 分析报告

**生成时间**: 2026-03-27  
**分析范围**: navigation_agent/backend/ 全模块  
**执行角色**: 资深后端架构师 & 代码审计员

---

## 第一章：全景 API 路由表

### 1.1 路由挂载结构

| 基础路径 | 路由文件 | 说明 |
|---------|---------|------|
| `/api/navigation` | mapRoutes.js + navigationRoutes.js | 导航与地图相关接口 |
| `/api/config/llm` | configRoutes.js | LLM 配置管理接口 |
| `/` | server.js (内联) | 服务根路由与健康检查 |

### 1.2 RESTful API 路由清单

| HTTP Method & 路由路径 | Controller 映射 | 业务用途简述 |
|------------------------|-----------------|--------------|
| `GET /health` | server.js (内联) | 服务健康状态检查 |
| `GET /` | server.js (内联) | 服务信息概览，列出可用 API |
| `GET /api/navigation/nearby` | corsightService.getNearbyPoints | 查询指定坐标附近的街景采样点 |
| `GET /api/navigation/point/:pointId` | corsightService.getPointById | 根据 ID 获取单个采样点详情 |
| `POST /api/navigation/preview` | previewController.generatePreview | **核心业务**: 生成导航预览（IR + 播报文案） |
| `GET /api/navigation/preview/test` | previewController.testPreview | 测试端点 - 使用预设坐标测试完整流程 |
| `GET /api/navigation/preview/health` | previewController.healthCheck | 健康检查 - 测试高德 API 与中间件连通性 |
| `POST /api/config/llm` | llmConfig.setActiveModel | 保存 LLM 配置（provider + model_name） |
| `GET /api/config/llm/active` | llmConfig.getActiveConfig | 获取当前激活的 LLM 配置 |
| `GET /api/config/llm/models` | llmConfig.getAvailableModels | 获取所有可用模型列表及配置状态 |
| `GET /api/config/llm/probe` | modelTester.probeAvailableModels | 探测候选模型（Gemini/DeepSeek/百炼）可用性 |
| `GET /api/config/llm/status` | llmConfig.getConfiguredProviders | 获取 LLM 配置调试状态 |
| `GET /api/config/llm/env-info` | llmConfig.getEnvKeyMap | 获取环境变量配置信息（不含敏感值） |
| `GET /api/config/models/classified` | llmConfig.getClassifiedModels | 获取分类模型列表（视觉模型 vs 文本模型） |
| `POST /api/config/models/vision` | llmConfig.setVisionModel | 设置视觉模型（需支持多模态） |
| `POST /api/config/models/text` | llmConfig.setTextModel | 设置文本模型 |

---

## 第二章：核心 API 契约

### 2.1 预览播报接口 - POST /api/navigation/preview

#### 2.1.1 Request Payload (请求体)

```typescript
{
  // 必填字段
  origin: String,        // 起点坐标，格式 "lng,lat"，如 "116.434307,39.90909"
  destination: String,   // 终点坐标，格式 "lng,lat"，如 "116.434446,39.90816"
  
  // 可选字段
  options: {
    enable_perception: Boolean,  // 是否启用视觉感知，默认 true
    enable_broadcast: Boolean    // 是否生成播报文案，默认 true
  }
}
```

| 字段名 | 数据类型 | 必填 | 说明 |
|--------|---------|------|------|
| `origin` | String | 是 | 起点经纬度，高德格式 "经度,纬度" |
| `destination` | String | 是 | 终点经纬度，高德格式 "经度,纬度" |
| `options` | Object | 否 | 功能开关配置 |
| `options.enable_perception` | Boolean | 否 | 是否调用视觉感知 Agent 补充街景信息 |
| `options.enable_broadcast` | Boolean | 否 | 是否调用语言优化 Agent 生成播报文案 |

#### 2.1.2 Response Payload (响应体) - 成功

```typescript
{
  success: true,
  data: {
    // IR 核心数据（展开到顶层，兼容前端直接访问）
    route_summary: {
      total_distance: String,           // 总距离，如 "700米"
      duration_estimate: String,        // 预计时长，如 "12分钟"
      original_steps_count: Number,     // 原始节点数
      filtered_nodes_count: Number,     // 过滤后关键节点数
      compression_ratio: String         // 压缩率，如 "40.0%"
    },
    key_nodes: [
      {
        node_index: Number,             // 节点序号，从 1 开始
        distance_from_start: String,    // 距起点距离，如 "100米"
        action: String,                 // 动作描述，如 "上天桥"
        clock_direction: String,        // 时钟方位，如 "11点钟方向"
        instruction: String,            // 原始导航指令
        road: String,                   // 道路名称
        distance: String,               // 本段距离
        orientation: String,            // 绝对方位
        polyline: String,               // 坐标串 "lng,lat;lng,lat"
        hazards: String[],              // 风险点数组（融合感知数据后）
        perception_data: {              // 视觉感知数据（可选）
          point_id: String,
          point_distance: Number,
          scene_description: String,
          analysis: {
            success: Boolean,
            parsed: Object,             // LLM 解析的 JSON 结果
            raw_response: String,
            provider: String
          },
          prompt_type: String           // 使用的提示词类型
        }
      }
    ],
    raw_data: {
      tolls: Number,
      toll_distance: Number,
      restriction: Number
    },
    
    // 完整 IR 保留
    ir: { /* 完整中间表示对象 */ },
    
    // 播报文案
    text: String,                       // 最终播报文本（三段式结构）
    
    // 元数据
    metadata: {
      pipeline_version: String,         // 如 "Phase 4"
      steps_completed: String[],        // 完成的步骤列表
      broadcast: {
        validation: Object,             // 输出验证结果
        fallback: Boolean,              // 是否使用了降级方案
        provider: String,               // 使用的 LLM 提供商
        retried: Boolean                // 是否经过重试
      }
    }
  }
}
```

#### 2.1.3 Error Responses (错误响应)

| HTTP 状态码 | 触发条件 | 响应结构 |
|------------|---------|---------|
| `400 Bad Request` | 缺少必要参数（origin/destination） | `{ success: false, error: String, message: String, example: Object }` |
| `500 Internal Server Error` | 高德 API 调用失败 / 数据处理异常 | `{ success: false, error: String, message: String }` |

**错误响应示例**:
```json
{
  "success": false,
  "error": "缺少必要参数",
  "message": "请提供 origin（起点）和 destination（终点）坐标",
  "example": {
    "origin": "116.434307,39.90909",
    "destination": "116.434446,39.90816"
  }
}
```

---

## 第三章：核心业务链路与内部数据流

### 3.1 执行链路概览

当请求进入 `previewController.generatePreview` 后，模块调用顺序如下：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 3 基础流程                              │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: amapService.getWalkingRoute()                          │
│     ↓ 返回高德原始路径数据 (pathData)                            │
│  Step 2: spatialMiddleware.generateIntermediateRepresentation() │
│     ↓ 返回 IR JSON (irJson)                                     │
├─────────────────────────────────────────────────────────────────┤
│                    Phase 4 增强流程（可选）                        │
├─────────────────────────────────────────────────────────────────┤
│  Step 3: perceptionAgent.enrichNodes(irJson.key_nodes)          │
│     ↓ 并发处理，返回富化后的 key_nodes                           │
│  Step 4: languageOptimizerAgent.generateBroadcast(irJson)       │
│     ↓ 返回播报文案 (broadcastText)                               │
└─────────────────────────────────────────────────────────────────┘
```

**同步/异步特性**:
- Step 1 → Step 2: **同步顺序执行**，依赖关系
- Step 3 (perceptionAgent): **异步并发执行**，使用 `Promise.all()` 并发处理所有节点
- Step 4: **同步顺序执行**，依赖 Step 3 结果

### 3.2 结构交接（最关键）

#### 3.2.1 spatialMiddleware → downstream 输出结构

**输出数据类型**: `IntermediateRepresentation (IR)`

```typescript
{
  route_summary: {
    total_distance: String,        // 格式化距离
    duration_estimate: String,     // 格式化时长
    original_steps_count: Number,  // 原始步骤数
    filtered_nodes_count: Number,  // 过滤后节点数
    compression_ratio: String      // 压缩比例
  },
  key_nodes: [
    {
      node_index: Number,
      distance_from_start: String,  // 累积距离
      action: String,               // 动作（如"上天桥"）
      clock_direction: String,      // 时钟方位（核心输出）
      instruction: String,          // 原始指令
      road: String,                 // 道路名
      distance: String,             // 本段距离
      orientation: String,          // 绝对方位
      polyline: String              // 坐标串，供后续提取坐标
    }
  ],
  raw_data: {
    tolls: Number,
    toll_distance: Number,
    restriction: Number
  }
}
```

**核心算法映射**:
```javascript
// 时钟方位计算公式（硬编码确定）
let deltaTheta = (currAngle - prevAngle + 360) % 360;
let clockFace = Math.round(deltaTheta / 30);
if (clockFace === 0) clockFace = 12;
return `${clockFace}点钟方向`;
```

#### 3.2.2 PerceptionAgent 视觉分析输出结构

**输入**: 单个节点的坐标（从 `node.polyline` 提取中点）  
**处理**: 并发查询 MongoDB 采样点 → 获取 8 方位图片 → LLM 视觉分析  
**输出数据结构**:

```typescript
{
  // 原节点字段保留...
  perception_data: {
    point_id: String,              // 采样点 ID
    point_distance: Number,        // 节点到采样点距离（米）
    scene_description: String,     // 场景描述
    analysis: {
      success: Boolean,
      raw_response: String,        // LLM 原始响应
      parsed: {
        // 根据提示词类型不同，结构各异：
        // 路径段类型:
        long_description?: String,
        medium_description?: String,
        short_description?: String,
        
        // 路口类型:
        accessibility_analysis?: {
          tactile_paving: String,   // 盲道情况
          audible_signals: String,  // 过街提示音
          pedestrian_signals: String
        },
        
        // 目的地类型:
        path_summary?: String,
        place_summary?: String,
        mobility_cues?: String,
        sidewalk?: Object,
        text?: String
      },
      provider: String,            // 使用的 LLM 提供商
      fallback: Boolean            // 是否降级
    },
    prompt_type: String            // "path" | "intersection" | "destination" | "feature"
  },
  perception_error: String         // 错误时记录原因
}
```

#### 3.2.3 LanguageOptimizerAgent 接收的完整输入 Payload

**输入**: 富化后的完整 IR 数据（`enhanceIRWithPerception()` 处理后的结果）

```typescript
{
  route_summary: { /* 同上 */ },
  key_nodes: [
    {
      node_index: Number,
      distance_from_start: String,
      action: String,
      clock_direction: String,
      instruction: String,
      road: String,
      distance: String,
      orientation: String,
      polyline: String,
      hazards: String[],           // ⭐ 融合感知数据后的风险数组
      visual_summary: String,     // ⭐ 从感知分析提取的视觉摘要
      perception_data: { /* 同上 */ }
    }
  ],
  raw_data: { /* 同上 */ }
}
```

**hazards 融合逻辑**（从 perception_data.analysis.parsed 提取）:
```javascript
// 提取的风险类型：
- parsed.hazards[]                    // 直接声明的风险
- parsed.accessibility_analysis:      // 无障碍分析
  - tactile_paving 包含 "无" → "无盲道铺设"
  - audible_signals 包含 "无" → "无过街提示音"
- parsed.sidewalk.obstacles[]         // 人行道障碍物
```

### 3.3 隐式依赖与副作用

#### 3.3.1 全局状态共享

| 模块 | 全局状态 | 说明 |
|------|---------|------|
| `llmConfig.js` | `activeModel`, `visionModel`, `textModel` | 当前激活的 LLM 配置，被多个模块共享 |
| `process.env` | API Keys | 从 .env 加载的各提供商 API Key |

#### 3.3.2 对象修改副作用

**无直接修改入参对象（req）的隐式行为**，但存在以下数据变换：

1. **perceptionAgent.enrichNodes()**:
   - 输入: `keyNodes` 数组（原对象引用）
   - 输出: 新数组，每个元素是原节点的浅拷贝 + 新增字段
   - **无副作用**: 使用展开运算符 `{ ...node, perception_data: {...} }`

2. **languageOptimizerAgent.enhanceIRWithPerception()**:
   - 创建新对象 `{ ...irData, key_nodes: irData.key_nodes.map(...) }`
   - **无副作用**: 纯函数式处理

3. **spatialMiddleware.generateIntermediateRepresentation()**:
   - 纯函数，不修改输入的 `pathData`

#### 3.3.3 外部依赖调用

| 依赖 | 调用方式 | 失败处理 |
|------|---------|---------|
| 高德步行路径 API | `amapService.getWalkingRoute()` | 抛出错误，中断流程 |
| MongoDB (采样点) | `corsightService.getNearbyPoints()` | 返回空数组，节点标记为 `perception_error` |
| LLM 视觉分析 | `llmClient.generateContent(modelType='vision')` | 记录错误，继续使用基础 IR |
| LLM 文本生成 | `llmClient.generateContent(modelType='text')` | 降级到 `generateSimpleFallback()` |

### 3.4 数据流可视化

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   HTTP Request  │────→│  previewController │────→│  amapService     │
│  (origin, dest) │     │   .generatePreview │     │  .getWalkingRoute │
└─────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                          │
                                                          ↓
                              ┌─────────────────────────────────────┐
                              │         高德路径数据 (pathData)       │
                              │  { paths: [{ steps: [...], ... }] }  │
                              └─────────────┬───────────────────────┘
                                            │
                                            ↓
                              ┌─────────────────────────────────────┐
                              │   spatialMiddleware                 │
                              │   .generateIntermediateRepresentation│
                              │                                     │
                              │  核心转换:                           │
                              │  1. isKeyNode() 过滤关键步骤         │
                              │  2. orientationToAngle() 方位转角度   │
                              │  3. calculateClockDirection() 时钟方位 │
                              └─────────────┬───────────────────────┘
                                            │
                                            ↓ IR JSON
                              ┌─────────────────────────────────────┐
                              │   perceptionAgent                   │
                              │   .enrichNodes(key_nodes)           │
                              │                                     │
                              │  并发处理每个节点:                    │
                              │  1. extractCoordinates(polyline)    │
                              │  2. corsightService.getNearbyPoints()│
                              │  3. extractImagePaths() → 8方位图片  │
                              │  4. selectPromptForNode() 选择提示词 │
                              │  5. llmClient.generateContent('vision')│
                              │  6. parseLLMResponse() 解析JSON      │
                              └─────────────┬───────────────────────┘
                                            │
                                            ↓ 富化后的 IR
                              ┌─────────────────────────────────────┐
                              │   languageOptimizerAgent            │
                              │   .generateBroadcast(irData)        │
                              │                                     │
                              │  处理流程:                           │
                              │  1. enhanceIRWithPerception()       │
                              │     → 融合 hazards, visual_summary  │
                              │  2. getChatMessages() 构建提示词    │
                              │  3. llmClient.generateContent('text')│
                              │  4. sanitizeOutput() 清理禁用词     │
                              │  5. validateOutput() 验证输出       │
                              │  6. 失败时 generateFallbackBroadcast()│
                              └─────────────┬───────────────────────┘
                                            │
                                            ↓ 播报文案
                              ┌─────────────────────────────────────┐
                              │        HTTP Response                │
                              │  { success: true, data: {...} }     │
                              └─────────────────────────────────────┘
```

---

## 附录：核心模块接口定义

### spatialMiddleware 导出接口

```javascript
module.exports = {
  generateIntermediateRepresentation,  // (pathData) => IR
  orientationToAngle,                   // (orientation) => Number | null
  calculateClockDirection,              // (prevAngle, currAngle) => String
  isKeyNode,                            // (step) => Boolean
  testMiddleware,                       // () => TestResult
  // 常量导出
  ORIENTATION_ANGLE_MAP,
  KEY_ACTION_KEYWORDS
};
```

### perceptionAgent 导出接口

```javascript
module.exports = {
  enrichNodes,        // (keyNodes) => Promise<EnrichedNodes[]>
  testPerceptionAgent // () => Promise<TestResult>
};
```

### languageOptimizerAgent 导出接口

```javascript
module.exports = {
  generateBroadcast,      // (irData) => Promise<BroadcastResult>
  formatBroadcast,        // (text) => FormattedBroadcast
  estimateReadingTime,    // (text) => Number (seconds)
  testLanguageOptimizer   // () => Promise<TestResult>
};
```

---

**报告结束**

*本报告严格遵循输入-输出-数据结构-模块边界原则，未涉及具体业务逻辑实现细节。*
