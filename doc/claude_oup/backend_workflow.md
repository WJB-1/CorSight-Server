# CorSight 后端工作流实现分析

> 本文档基于对 `CorSight-Server/backend` 源码的完整阅读，梳理当前行前预览功能的实际实现流程。
> 生成时间：2026-04-30

---

## 一、总体架构

```
┌─────────────────┐     ┌───────────────────────────┐     ┌───────────────────────┐
│   客户端请求     │────→│  Preview Controller       │────→│   高德路径规划         │
│  (origin, dest) │     │   (previewController.js)  │     │  (amapService)        │
└─────────────────┘     └───────────────────────────┘     └───────────────────────┘
                                 │
                                 ▼
                        ┌────────────────────────────┐
                        │  Spatial Middleware        │
                        │ (spatialMiddleware.js)     │
                        │  关键节点提取 + 时钟方向计算 │
                        └────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
           ┌─────────────────────┐      ┌──────────────────────────────┐
           │ Perception Agent    │      │ Language Optimizer           │
           │ (perceptionAgent.js)│      │ (languageOptimizerAgent.js)  │
           │  VLM视觉分析         │      │  播报文案生成                 │
           └─────────────────────┘      └──────────────────────────────┘
                    │                         │
                    └────────────┬────────────┘
                                 ▼
                        ┌────────────────────────┐
                        │   统一响应输出          │
                        │  {text, key_nodes, ir} │
                        └────────────────────────┘
```

**核心文件位置：**

| 模块 | 文件路径 |
|------|----------|
| 主控制器 | `backend/controllers/previewController.js` |
| 空间中间件 | `backend/middleware/spatialMiddleware.js` |
| 感知Agent | `backend/agents/perceptionAgent.js` |
| 语言优化Agent | `backend/agents/languageOptimizerAgent.js` |
| LLM客户端 | `backend/services/llmClient.js` |
| 高德服务 | `backend/services/amapService.js` |
| 街景查询 | `backend/services/corsightService.js` |
| 提示词库 | `backend/prompts/sceneScoutPrompts.js` |
| 防御性提示词 | `backend/prompts/defensivePrompts.js` |

---

## 二、Phase 1：高德路径规划

### 2.1 输入格式

```javascript
// POST /api/navigation/preview
{
  "origin": "116.434307,39.90909",      // 字符串格式："经度,纬度"
  "destination": "116.434446,39.90816",
  "options": {
    "enable_perception": true,   // 是否启用视觉感知（默认true）
    "enable_broadcast": true     // 是否生成播报文案（默认true）
  }
}
```

### 2.2 高德API调用

- **接口：** `https://restapi.amap.com/v3/direction/walking`
- **返回：** `route.paths[0]` 取第一条最优路径
- **原始数据包含：** `steps` 数组，每个 step 有 `instruction`（导航指令）、`orientation`（绝对方位）、`distance`（距离）、`polyline`（坐标串）

---

## 三、Phase 2：关键节点选取与时钟方向计算

### 3.1 关键节点过滤逻辑 (`isKeyNode`)

代码通过**关键词匹配**判断一个 step 是否为关键节点：

**保留的关键词（`KEY_ACTION_KEYWORDS`）：**

| 类别 | 关键词 |
|------|--------|
| 转向动作 | `左转`, `右转`, `左前方`, `右前方`, `左后方`, `右后方`, `调头`, `掉头` |
| 特殊地形 | `天桥`, `地下通道`, `通道`, `隧道`, `扶梯`, `电梯`, `楼梯` |
| 过马路 | `斑马线`, `人行横道`, `过街` |
| 明显标志物 | `进入`, `离开`, `到达` |

**过滤掉的关键词（纯直行）：**
`直行`, `靠左`, `靠右`, `沿`, `向`

**兜底策略：** 如果过滤后没有关键节点，保留第一个和最后一个 step。

### 3.2 时钟方向计算算法

```
上一节点绝对方位角 θ_prev
当前节点绝对方位角 θ_curr
相对转向角度：Δθ = (θ_curr - θ_prev + 360) % 360
时钟方位：clockFace = round(Δθ / 30)
若 clockFace === 0，强制设为 12
```

**示例：**
- 北(0°) → 东(90°)：Δθ=90，clockFace=3 → **3点钟方向**
- 北(0°) → 南(180°)：Δθ=180，clockFace=6 → **6点钟方向**
- 西(270°) → 北(0°)：Δθ=90，clockFace=3 → **3点钟方向**

### 3.3 IR（中间表示）输出结构

```json
{
  "route_summary": {
    "total_distance": "700米",
    "duration_estimate": "12分钟",
    "original_steps_count": 15,
    "filtered_nodes_count": 6,
    "compression_ratio": "60.0%"
  },
  "key_nodes": [
    {
      "node_index": 1,
      "distance_from_start": "100米",
      "action": "上天桥",
      "clock_direction": "11点钟方向",
      "instruction": "向东南步行50米后上天桥",
      "road": "东长安街",
      "distance": "50米",
      "orientation": "东南",
      "polyline": "116.397428,39.90923;116.397528,39.90933"
    }
  ],
  "raw_data": { ... }
}
```

### 3.4 关于"特殊照顾天桥等特殊节点"的结论

**结论：有特殊照顾，但实现方式简单。**

- ✅ `isKeyNode` 函数中，`天桥`、`地下通道`、`楼梯` 等关键词**明确在保留列表中**
- ✅ 这些节点会被保留在 `key_nodes` 中，不会被过滤掉
- ❌ **没有额外的加权或优先级排序**，只是"保留"而非"重点标记"
- ❌ **没有针对连续节点的特殊处理**（如"上天桥→下天桥"是否合并）
- ❌ **拐点（转向）和特殊地形使用同一套过滤逻辑**，没有区分优先级

---

## 四、Phase 3：Perception Agent — 街景图获取与VLM分析

### 4.1 街景采样点查询逻辑

对于每个关键节点：

```javascript
// 1. 提取节点坐标
// 优先从 node.lat/node.lng 获取，
// 其次从 node.polyline 取中点

// 2. 查询附近采样点（50米半径）
const nearbyPoints = await corsightService.getNearbyPoints(lat, lng, 50);

// 3. 取最近的一个采样点
const nearestPoint = nearbyPoints[0];  // 按距离排序后的第一个
```

**注意：**
- 搜索半径固定为 **50米**
- 只取**最近的一个**采样点，不合并多个采样点
- 如果50米内没有采样点，该节点的 `perception_data` 为 `null`

### 4.2 向Agent传递街景图的方式

**结论：直接传递8方向图片URL，无描述文本辅助。**

```javascript
// perceptionAgent.js 第 70-72 行
const imagePaths = extractImagePaths(nearestPoint);
// 提取 N, NE, E, SE, S, SW, W, NW 八个方向的图片路径

// 第 90-94 行
const perceptionResult = await analyzeWithLLM(
    prompt,           // 根据节点类型选择的提示词
    imagePaths,       // 8张图片的URL数组
    node              // 节点上下文（action, clock_direction等）
);
```

**传递给LLM的内容：**

| 内容 | 说明 |
|------|------|
| **8张街景图** | 通过URL加载，转换为base64后传入VLM |
| **提示词** | 根据节点类型动态选择（路口/路段/特殊地形/目的地） |
| **导航上下文** | `action`（如"上天桥"）、`clock_direction`（如"11点钟方向"） |
| **scene_description** | 数据库中的场景描述字段（**当前所有采样点此字段为空**） |

**重要发现：**
- ❌ **所有33个采样点的 `scene_description` 字段都是空字符串**，LLM无法获得任何人工标注的先验信息
- ✅ 提示词中**包含当前导航上下文**（动作+方位），帮助VLM理解"用户从哪个方向来、要做什么"
- ❌ 图片是**原始8方向全量传递**，没有做裁剪或筛选（如只传 facing direction 相关的几张）

### 4.3 提示词分类（4种场景）

| 场景类型 | 触发条件 | 输出Schema重点 |
|----------|----------|---------------|
| `intersection` | 包含"路口"/"斑马线"/"过街" | 盲道铺设、过街提示音、斑马线宽度 |
| `path` | 默认/沿途路段 | 人行道宽度、路面材质、障碍物 |
| `feature` | 包含"天桥"/"地下通道"/"台阶" | 入口位置、结构细节、出口朝向、扶手 |
| `destination` | 包含"到达"/"目的地" | 目的地周边、最后接近策略 |

### 4.4 并发处理

```javascript
// 所有节点并发处理
const processingPromises = keyNodes.map(async (node, index) => { ... });
const enrichedNodes = await Promise.all(processingPromises);
```

**注意：** 并发数等于关键节点数，如果节点多且LLM响应慢，可能触发速率限制。

---

## 五、Phase 4：Language Optimizer Agent — 播报文案生成

### 5.1 数据融合逻辑 (`enhanceIRWithPerception`)

**结论：有融合，但方式简单——仅提取hazards合并。**

```javascript
// 1. 从感知分析中提取风险点
const additionalHazards = [];
if (analysis.parsed.hazards) {
    additionalHazards.push(...analysis.parsed.hazards);
}
if (analysis.parsed.accessibility_analysis?.tactile_paving?.includes('无')) {
    additionalHazards.push('无盲道铺设');
}
if (analysis.parsed.sidewalk?.obstacles) {
    additionalHazards.push(...analysis.parsed.sidewalk.obstacles);
}

// 2. 合并到节点的 hazards 字段
const allHazards = [...new Set([...existingHazards, ...additionalHazards])];

// 3. 同时提取 visual_summary（用于调试，不直接用于播报生成）
```

**融合的内容：**
- ✅ `hazards` 列表合并（去重）
- ✅ 自动推断"无盲道铺设"、"无过街提示音"等隐含风险
- ❌ **没有融合盲道方向、入口宽度、台阶数量等结构化信息**
- ❌ **没有融合 landmarks（地标）信息**
- ❌ **没有融合 mobility_cues（移动线索）信息**

### 5.2 主Agent整合方式

**结论：主Agent（Language Optimizer）确实混合结合了路径信息，但融合深度有限。**

传递给LLM的完整提示词结构：

```
[System Prompt]  ← 约80行的O&M专家角色定义 + 6条绝对约束法则
    │
[Few-Shot Example]  ← 1个完整的输入/输出示例对
    │
[User Prompt]  ← 当前路线的结构化数据：
    ├── 路线概要（总距离、预计时间、节点数、压缩率）
    ├── 关键节点序列（每个节点的距离、动作、时钟方位、指令、道路、风险点）
    └── 最后50米提示（如果有）
```

**User Prompt 示例片段：**

```
【路线概要】
- 总距离：700米
- 预计时间：12分钟
- 关键节点数：3个

【关键节点序列】

节点 1:
- 距离起点：100米
- 动作：上天桥
- 时钟方位：11点钟方向
- 指令：向东南步行50米后上天桥
- 道路：东长安街
- 风险点：两段连续向上台阶、无盲道铺设

节点 2:
- 距离起点：600米
- 动作：过马路
- 时钟方位：12点钟方向
- 风险点：无盲道、机非混行
...
```

**注意：**
- ✅ 路径信息（距离、方位、动作）和感知信息（风险点）**确实混合在同一提示词中**
- ✅ LLM作为"主Agent"，**自行学习如何整合这些信息**生成自然语言
- ❌ **没有显式的结构化融合逻辑**（如"如果上天桥+无盲道→增加风险提示等级"）
- ❌ **感知数据中的 landmarks、入口宽度、台阶数量等细节可能丢失**，因为只提取了 `hazards`

### 5.3 输出约束与后处理

**System Prompt 中的6条绝对约束法则：**

1. **听觉友好原则** — 禁止颜色、视觉描述；允许口语化连接词
2. **时钟定位法则** — 只能用"X点钟方向"，禁止"左转/右转/东南西北"
3. **聚焦空间突变节点** — 忽略平坦路段，聚焦台阶/天桥/路口
4. **最后50米高保真触觉提示** — 必须单独描述终点前微观环境
5. **推演语气** — 使用"将遇到"而非"注意前方"（用户还在家中）
6. **反Markdown红线** — 禁止任何Markdown符号，纯自然短句

**后处理流水线：**

```
LLM原始输出
    ↓
sanitizeOutput()  ← 去除Markdown、禁用词（视觉词汇、问候语）
    ↓
validateOutput()  ← 校验：含时钟方向？3段落？无视觉词？无问候？
    ↓
[如果校验失败] → 重试一次（temperature降至0.05）
    ↓
最终播报文本
```

### 5.4 降级策略

| 场景 | 处理方式 |
|------|----------|
| Perception Agent 失败 | 继续使用基础IR，该节点无感知数据 |
| Language Optimizer 失败 | 使用 `generateSimpleFallback()` 生成基础播报 |
| LLM调用失败 | 返回基础描述（全程X米，节点1...节点2...） |
| 无街景数据 | 该节点跳过视觉分析，不影响整体流程 |

---

## 六、关键发现与建议

### 6.1 当前实现的优势

1. **完整的端到端流水线** — 从路径规划到播报生成，链路已打通
2. **专业的提示词工程** — 4类场景提示词 + 防御性约束 + Few-Shot示例
3. **多Provider支持** — Gemini/DeepSeek/百炼Qwen可切换
4. **容错设计** — 任何环节失败都不中断整体流程
5. **时钟方向创新** — 将绝对方位转为相对时钟方位，符合视障用户认知

### 6.2 当前实现的不足

| 问题 | 影响 | 建议 |
|------|------|------|
| `scene_description` 全为空 | LLM无法获得人工标注的先验信息 | 组织人工标注或半自动填充 |
| 只取最近1个采样点（50米内） | 可能错过更合适的采样点 | 考虑取前2-3个，让LLM判断 |
| 8张图全量传递 | Token消耗大、无关信息多 | 只传 facing direction ±2 张 |
| 感知数据仅提取 `hazards` | landmarks、入口宽度等信息丢失 | 扩展融合字段 |
| 节点间无关联分析 | "上天桥→下天桥"可能分两次描述 | 增加连续节点合并逻辑 |
| 无历史对话/用户偏好 | 每次请求都是独立状态 | 后续可添加用户画像 |
| 提示词存在三重矛盾（详见Issue #8） | LLM输出不稳定，需大量后处理清理 | 重构提示词体系，消除自相冲突 |

### 6.3 与 architecture.txt 规划的对比

| 规划要求 | 实际实现 | 符合度 |
|----------|----------|--------|
| "提取需要子Agent分析的节点经纬坐标" | ✅ 已实现，通过 `isKeyNode` 过滤 | 100% |
| "必须考虑拐点上的街景信息，直行路段可分段离散采样" | ⚠️ 拐点已考虑，但直行路段**完全过滤**而非"分段采样" | 60% |
| "按类别输送至不同子Agent" | ✅ 4类场景提示词（路口/路段/地形/目的地） | 100% |
| "子Agent将数据返回主Agent，主Agent结合路径描述整合输出" | ⚠️ 有融合但深度有限，仅合并hazards | 70% |
| "主从Agent架构" | ❌ 两个Agent**串行执行**，非主从协作 | 40% |
| 提示词约束有效性 | ❌ System Prompt自相矛盾，sanitizeOutput需97行清理 | 30% |

---

## 七、接口速查

### 请求

```bash
POST /api/navigation/preview
Content-Type: application/json

{
  "origin": "116.397428,39.90923",
  "destination": "116.410876,39.911946",
  "options": {
    "enable_perception": true,
    "enable_broadcast": true
  }
}
```

### 响应

```json
{
  "success": true,
  "data": {
    "route_summary": { ... },
    "key_nodes": [ ... ],
    "ir": { ... },
    "text": "全程700米，途中我们需要特别留意一座天桥和一个没有盲道的路口...",
    "metadata": {
      "pipeline_version": "Phase 4",
      "steps_completed": ["amap_routing", "spatial_filtering", "perception_enrichment", "broadcast_generation"]
    }
  }
}
```

### 健康检查

```bash
GET /api/navigation/preview/health
GET /health
GET /api/navigation/preview/test  # 使用预设坐标测试完整流程
```
