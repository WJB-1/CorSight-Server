# CorSight 问题排查追踪文档

> 本文档记录 CorSight v1.0 项目在代码审查过程中发现的所有问题，待集中讨论后统一修复。
> 创建时间：2026-04-30

---

## 问题列表

### Issue #1: spatialMiddleware 未利用高德结构化字段进行节点过滤

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/middleware/spatialMiddleware.js`

#### 问题描述

`isKeyNode()` 函数当前通过对 `instruction` 文本做关键词匹配来判断关键节点，完全没有利用高德 API 返回的结构化字段：

- ❌ `walk_type` — 完全未读取（最高效的路段类型标识）
- ❌ `assistant_action` — 完全未读取（辅助动作信息）
- ⚠️ `action` — 读取了但未利用其枚举特性，而是和 `instruction` 拼接后做文本匹配

#### 当前实现（问题代码）

```javascript
// spatialMiddleware.js 第115-149行
function isKeyNode(step) {
    const action = step.action || '';
    const instruction = step.instruction || '';
    const text = `${action} ${instruction}`.toLowerCase();

    // 检查是否包含关键动作关键词
    for (const keyword of KEY_ACTION_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    // ...
}
```

#### 高德实际提供的结构化字段

**`walk_type` 枚举值：**

| 值 | 含义 | 是否关键节点 |
|----|------|-------------|
| `0` | 普通道路 | 否 |
| `1` | 人行横道 | ✅ 是 |
| `3` | 地下通道 | ✅ 是 |
| `4` | 过街天桥 | ✅ 是 |
| `8` | 扶梯 | ✅ 是 |
| `9` | 直梯 | ✅ 是 |
| `12` | 建筑物穿越通道 | ✅ 是 |
| `13` | 行人通道 | ✅ 是 |
| `20` | 阶梯 | ✅ 是 |
| `21` | 斜坡 | ✅ 是 |
| `22` | 桥 | ✅ 是 |
| `23` | 隧道 | ✅ 是 |

**`action` 主要动作枚举值：**

| 值 | 含义 | 是否关键节点 |
|----|------|-------------|
| `无基本导航动作` | 纯直行 | 否 |
| `直行` | 继续直行 | 否 |
| `靠左` / `靠右` | 车道偏移 | 否 |
| `左转` / `右转` | 明确转向 | ✅ 是 |
| `向左前方` / `向右前方` | 偏转 | ✅ 是 |
| `通过人行横道` | 过马路 | ✅ 是 |
| `通过过街天桥` | 天桥 | ✅ 是 |
| `通过地下通道` | 地下通道 | ✅ 是 |
| `到道路斜对面` | 斜穿 | ✅ 是 |

**`assistant_action` 辅助动作：**

| 值 | 含义 | 是否关键节点 |
|----|------|-------------|
| `到达目的地` | 终点 | ✅ 是 |
| `进入右侧道路` / `进入左侧道路` | 道路切换 | 视情况 |

#### 建议修复方案

```javascript
function isKeyNode(step) {
    // 1. 优先使用 walk_type（最可靠的结构化标识）
    const walkType = parseInt(step.walk_type, 10);
    const SPECIAL_WALK_TYPES = [1, 3, 4, 8, 9, 12, 13, 20, 21, 22, 23];
    if (SPECIAL_WALK_TYPES.includes(walkType)) return true;

    // 2. 使用 action 判断转向
    const action = step.action || '';
    const TURN_ACTIONS = ['左转', '右转', '向左前方', '向右前方', 
                          '向左后方', '向右后方', '到道路斜对面'];
    if (TURN_ACTIONS.includes(action)) return true;

    // 3. 辅助动作判断终点
    const assistantAction = step.assistant_action || '';
    if (assistantAction === '到达目的地') return true;

    // 4. 兜底：检查 instruction 中的特殊地形（保留现有逻辑作为fallback）
    const instruction = step.instruction || '';
    const text = `${action} ${instruction}`.toLowerCase();
    for (const keyword of KEY_ACTION_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) return true;
    }

    return false;
}
```

#### 额外建议

- 长直路段（`walk_type=0` 且 `action` 为直行/无动作）应每隔 **200米** 强制插入一个采样点，避免信息真空
- `assistant_action` 中的 `进入右侧道路`/`进入左侧道路` 可作为道路切换提示

---

### Issue #2: 时钟方向转换逻辑多余且准确性存疑

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/middleware/spatialMiddleware.js`, `backend/agents/languageOptimizerAgent.js`, `backend/prompts/defensivePrompts.js`, `backend/prompts/templates/language-optimizer-system.md`, `backend/prompts/templates/perception-*.md`

#### 问题描述

当前代码将高德返回的绝对方位（如"东南"）转换为相对时钟方向（如"3点钟方向"），并在整个系统中强制使用"X点钟方向"作为唯一的方向表达方式。但存在以下问题：

1. **用户需求不匹配** — 据前期调研，视障群体在日常生活中很少使用时钟定位法，这不是他们的通用认知习惯
2. **准确性存疑** — 基于高德宏观导航数据计算的相对转向角度，在实际步行场景中误差可能很大：
   - 高德 `orientation` 是路段整体走向，不是精确到米级的航向
   - 用户在路口的实际转向角度受道路曲率、人行道宽度影响
   - 30°一个刻度的时钟粒度太粗（如2点和3点之间差30°，实际可能是15°或45°）
3. **过度侵入** — 时钟方向被硬编码进11个文件、61处引用，包括：
   - System Prompt 的"绝对约束法则"
   - 输出验证逻辑（`validateOutput` 检查是否含"点钟方向"）
   - Few-Shot 示例
   - Perception Agent 的提示词模板
   - 降级播报生成逻辑

#### 当前实现（问题代码）

```javascript
// spatialMiddleware.js 第165-178行
function calculateClockDirection(prevAngle, currAngle) {
    let deltaTheta = (currAngle - prevAngle + 360) % 360;
    let clockFace = Math.round(deltaTheta / 30);
    if (clockFace === 0) clockFace = 12;
    return `${clockFace}点钟方向`;
}
```

#### 建议修复方案

**方案A：完全删除时钟方向（推荐）**

1. `spatialMiddleware.js`：删除 `calculateClockDirection`，保留 `orientation` 绝对方位原样输出
2. `language-optimizer-system.md`：将"时钟定位法则"改为"相对方向描述"，允许使用"左转""右转""直行"等自然表达
3. `defensivePrompts.js`：删除 `hasClockDirection` 校验，改为校验是否含方向描述
4. `languageOptimizerAgent.js`：降级播报中删除时钟方向相关代码
5. `perception-*.md`：删除提示词中的时钟方向引用

**方案B：保留但降级为可选**

- 保留时钟方向计算，但改为可选字段
- 播报中允许混合使用"左转"和"X点钟方向"
- 由用户设置偏好（后续版本）

#### 影响范围评估

| 文件 | 引用次数 | 修改内容 |
|------|---------|----------|
| `spatialMiddleware.js` | 15 | 删除 `calculateClockDirection` 及相关调用 |
| `language-optimizer-system.md` | 8 | 修改约束法则和示例 |
| `defensivePrompts.js` | 11 | 修改验证逻辑和 Few-Shot 示例 |
| `languageOptimizerAgent.js` | 4 | 修改降级播报和测试用例 |
| `sceneScoutPrompts.js` | 6 | 删除感知提示词中的时钟引用 |
| `perception-intersection.md` | 3 | 删除提示词模板中的时钟引用 |
| `perception-feature.md` | 2 | 同上 |
| `previewController.js` | 1 | 修改降级播报 |
| `perceptionAgent.js` | 1 | 删除上下文中的时钟引用 |
| `llmClient.js` | 1 | 可能涉及的日志/注释 |
| `old_version/language-optimizer-system.md` | 9 | 历史版本，可忽略 |

---

### Issue #3: 直行路段缺少离散采样点，街景覆盖不完整

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/middleware/spatialMiddleware.js`, `backend/agents/perceptionAgent.js`, `backend/controllers/previewController.js`

#### 问题描述

当前 `generateIntermediateRepresentation()` 仅对 `isKeyNode()` 返回 `true` 的 step 生成节点，Perception Agent 也只对这些节点请求街景数据。这意味着：

- **长直路段完全被忽略** — 如果两个拐点之间相隔500米直路，这段路没有任何街景分析
- **道路环境信息真空** — 无法获知直路上是否有施工围挡、盲道中断、路面坑洼等
- **与 architecture.txt 规划不符** — 规划明确提到"直行路段可分段离散采样"

#### 当前实现（问题代码）

```javascript
// previewController.js 第75-89行
let irJson = spatialMiddleware.generateIntermediateRepresentation(pathData);

// 步骤 3: 多智能体环境感知补充（可选）
if (enablePerception && irJson.key_nodes.length > 0) {
    irJson.key_nodes = await perceptionAgent.enrichNodes(irJson.key_nodes);
    // 只对 key_nodes 做视觉分析！
}
```

```javascript
// spatialMiddleware.js 第245-246行
// 步骤 1: 过滤关键节点
const keySteps = pathData.steps.filter(isKeyNode);
// 只有关键节点进入后续处理
```

#### 期望的行为

根据 architecture.txt 的规划：

> "基于路径上的信息（必须考虑拐点上的街景信息，**直行路段可分段离散采样**）提取需要子Agent分析的节点经纬坐标"

直行路段应该：
1. **每隔一定距离（如150-200米）插入一个采样点**
2. **对这些采样点也进行街景分析**（路面状况、盲道连续性、障碍物等）
3. **将分析结果融入播报文案**（"接下来200米路面平整，有连续盲道"）

#### 建议修复方案

**方案A：在 spatialMiddleware 中插入直路采样点（推荐）**

```javascript
function generateIntermediateRepresentation(pathData) {
    // 1. 先提取所有关键节点
    const keySteps = pathData.steps.filter(isKeyNode);
    
    // 2. 遍历原始 steps，在长直路段中插入采样点
    const allNodes = [];
    let accumulatedDistance = 0;
    let lastSampleDistance = 0;
    
    for (let i = 0; i < pathData.steps.length; i++) {
        const step = pathData.steps[i];
        const stepDistance = parseInt(step.distance, 10) || 0;
        accumulatedDistance += stepDistance;
        
        // 关键节点直接加入
        if (isKeyNode(step)) {
            allNodes.push(createNode(step, accumulatedDistance, 'key'));
            lastSampleDistance = accumulatedDistance;
        }
        // 直路段：距离上一个采样点超过阈值时插入
        else if (accumulatedDistance - lastSampleDistance >= 200) {
            allNodes.push(createNode(step, accumulatedDistance, 'sample'));
            lastSampleDistance = accumulatedDistance;
        }
    }
    
    // 3. 返回包含 key + sample 的完整节点列表
}
```

**节点类型标记：**

| 类型 | 标记 | Perception Agent 处理 | 播报中使用 |
|------|------|----------------------|-----------|
| `key` | 拐点/特殊地形 | 全量分析（8方向图+详细Schema） | 详细描述 |
| `sample` | 直路采样点 | 简化分析（路面+盲道+障碍物） | 概括性描述 |

**方案B：在 Perception Agent 中做采样**

- 保持 `key_nodes` 不变
- Perception Agent 额外接收原始 `pathData.steps`
- 自行计算直路上的采样坐标并请求街景
- 将结果作为 `path_segments` 附加到 IR 中

**缺点：** 职责不清，spatialMiddleware 和 Perception Agent 耦合

#### 影响范围

| 文件 | 修改内容 |
|------|---------|
| `spatialMiddleware.js` | 添加直路采样点插入逻辑；节点增加 `node_type` 字段 |
| `perceptionAgent.js` | 根据 `node_type` 选择不同的分析深度（key=完整，sample=简化） |
| `sceneScoutPrompts.js` | 新增 `path-sample` 类型提示词（简化版路面分析） |
| `languageOptimizerAgent.js` | 播报中融入直路采样点的概括描述 |
| `previewController.js` | 可能不需要修改，保持对 `irJson.key_nodes` 的调用 |

#### 额外考虑

- **采样间隔**：建议 **150-200米**，视街景数据密度调整
- **采样点坐标**：取 step 的 polyline 中点，或根据累积距离插值计算
- **避免过度采样**：如果直路段只有80米，不需要额外采样
- **与 Issue #1 的关系**：修复 Issue #1 后，`walk_type=0` 的直路段更容易识别，便于插入采样点

---

### Issue #4: 子Agent选择逻辑过于简单，未实现真正的"主从Agent协作"

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/prompts/sceneScoutPrompts.js`, `backend/agents/perceptionAgent.js`

#### 问题描述

当前 "子Agent选择" 实际上只是**提示词选择**（`selectPromptForNode`），而非真正的Agent调度：

1. **没有独立的子Agent实例** — 所有节点共用同一个 `perceptionAgent.enrichNodes()` 函数，只是传入不同的提示词
2. **选择逻辑过于简单** — 基于 `action` + `instruction` 的文本关键词匹配，没有利用 `walk_type` 等结构化字段
3. **没有主Agent统筹** — 没有主Agent分析节点间关系、分配任务、整合结果的过程
4. **与 architecture.txt 规划不符** — 规划描述的是"主从Agent架构"，当前只是"一个函数+不同提示词"

#### 当前实现（问题代码）

```javascript
// perceptionAgent.js 第81-94行
// 5. 根据节点类型选择提示词
const promptSelection = selectPromptForNode({
    ...node,
    road: node.road || nearestPoint.scene_description
});

console.log(`[perceptionAgent] 节点 ${node.node_index} 使用提示词类型: ${promptSelection.type}`);

// 6. 调用 LLM 进行视觉分析
const perceptionResult = await analyzeWithLLM(
    promptSelection.prompt,
    imagePaths,
    node
);
```

```javascript
// sceneScoutPrompts.js 第147-204行
function selectPromptForNode(node) {
  const action = (node.action || '').toLowerCase();
  const instruction = (node.instruction || '').toLowerCase();
  const text = `${action} ${instruction}`;

  // 判断节点类型 —— 纯文本关键词匹配！
  if (text.includes('路口') || text.includes('斑马线') || text.includes('过街')) {
    return { type: 'intersection', prompt: getIntersectionPrompt(node), ... };
  }
  if (text.includes('天桥') || text.includes('人行天桥')) {
    return { type: 'overpass', prompt: getFeaturePrompt({...node, featureType: 'overpass'}), ... };
  }
  if (text.includes('地下通道') || text.includes('隧道')) {
    return { type: 'underpass', prompt: getFeaturePrompt({...node, featureType: 'underpass'}), ... };
  }
  if (text.includes('台阶') || text.includes('楼梯')) {
    return { type: 'steps', prompt: getFeaturePrompt({...node, featureType: 'steps'}), ... };
  }
  if (text.includes('到达') || text.includes('目的地')) {
    return { type: 'destination', prompt: getDestinationPrompt(node), ... };
  }
  return { type: 'path', prompt: getPathPrompt(node), ... };
}
```

#### 问题分析

**1. 选择逻辑与 Issue #1 相同的问题**

和 `isKeyNode()` 一样，`selectPromptForNode()` 也是基于 `instruction` 文本做关键词匹配，完全没有利用：
- ❌ `walk_type` — 可直接判断是否为地下通道(3)/天桥(4)/阶梯(20)等
- ❌ `action` 的枚举值 — `通过人行横道` → intersection，`通过过街天桥` → feature/overpass
- ❌ `assistant_action` — `到达目的地` → destination

**2. 没有真正的"Agent"概念**

architecture.txt 规划的：
```
主Agent ──分配任务──→ 子Agent A (路口分析专家)
         ──分配任务──→ 子Agent B (地形分析专家)  
         ──分配任务──→ 子Agent C (路段分析专家)
         ←──整合结果──┘
```

当前实现的：
```
perceptionAgent.enrichNodes() ──for循环──→ 节点1: 传入intersection提示词
                              ──for循环──→ 节点2: 传入feature提示词
                              ──for循环──→ 节点3: 传入path提示词
```

**区别：**
- ❌ 没有主Agent的"任务分配"决策过程
- ❌ 没有子Agent的独立状态/记忆
- ❌ 没有主Agent的"结果整合"（只是简单附加到节点上）
- ❌ 所有节点共用同一个LLM调用逻辑，只是提示词不同

**3. 缺少节点间关系分析**

主Agent应该做的但没有做的：
- 分析"上天桥"和"下天桥"是否为同一座天桥的进出口
- 判断连续多个路口是否属于同一复杂交叉口
- 识别"进入地下通道"→"出地下通道"的配对关系
- 根据前后节点调整当前节点的分析重点

#### 建议修复方案

**短期修复（最小改动）：**

1. **改进 `selectPromptForNode()` 的选择逻辑**
   - 优先使用 `walk_type` 判断场景类型
   - 其次使用 `action` 枚举值
   - 最后才 fallback 到 `instruction` 文本匹配

```javascript
function selectPromptForNode(node) {
  // 1. 优先使用 walk_type（最可靠）
  const walkType = parseInt(node.walk_type, 10);
  switch (walkType) {
    case 1: return { type: 'intersection', prompt: getIntersectionPrompt(node), ... };
    case 3: return { type: 'underpass', prompt: getFeaturePrompt({...node, featureType: 'underpass'}), ... };
    case 4: return { type: 'overpass', prompt: getFeaturePrompt({...node, featureType: 'overpass'}), ... };
    case 20: return { type: 'steps', prompt: getFeaturePrompt({...node, featureType: 'steps'}), ... };
    // ... 其他 walk_type
  }

  // 2. 使用 action 判断
  const action = (node.action || '').toLowerCase();
  if (action.includes('人行横道') || action.includes('过街')) {
    return { type: 'intersection', prompt: getIntersectionPrompt(node), ... };
  }
  if (action.includes('过街天桥')) {
    return { type: 'overpass', prompt: getFeaturePrompt({...node, featureType: 'overpass'}), ... };
  }
  // ...

  // 3. 兜底：instruction 文本匹配
  // ...
}
```

**中期改进（真正的主从Agent）：**

1. **引入 Master Agent**
   - 接收完整 IR 数据
   - 分析节点间关系（配对、连续、层级）
   - 为每个节点分配最合适的子Agent类型
   - 定义子Agent间的依赖关系（如"先分析天桥入口，再分析天桥出口"）

2. **子Agent专业化**
   - `IntersectionAgent` — 路口/斑马线专家（关注信号灯、盲道、车流）
   - `TerrainAgent` — 地形专家（关注台阶、坡度、扶手、入口宽度）
   - `PathSegmentAgent` — 路段专家（关注路面、盲道连续性、障碍物）
   - `DestinationAgent` — 目的地专家（关注最后接近策略、入口定位）

3. **主Agent整合逻辑**
   - 收集所有子Agent结果
   - 识别冲突（如入口说有盲道，出口说没有）
   - 生成一致性报告
   - 为 Language Optimizer 提供结构化的融合数据

#### 影响范围

| 文件 | 修改内容 |
|------|---------|
| `sceneScoutPrompts.js` | 重写 `selectPromptForNode()`，优先使用结构化字段 |
| `spatialMiddleware.js` | 确保 `walk_type`/`action` 等字段传递到节点 |
| `perceptionAgent.js` | 短期：无修改；中期：拆分为 Master + 子Agent |
| 新增 `agents/masterAgent.js` | 中期：主Agent实现 |
| 新增 `agents/intersectionAgent.js` | 中期：路口子Agent |
| 新增 `agents/terrainAgent.js` | 中期：地形子Agent |
| 新增 `agents/pathSegmentAgent.js` | 中期：路段子Agent |

#### 与 Issue #1 的关系

- Issue #1 修复后，`walk_type` 和 `action` 字段会被正确传递到节点
- Issue #4 的修复可以直接利用这些结构化字段做Agent选择
- 建议 **先修复 Issue #1，再修复 Issue #4**

---

### Issue #5: Perception Agent 传入8张全向街景图，未做方向筛选和标注

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/agents/perceptionAgent.js`, `backend/services/llmClient.js`, `backend/middleware/spatialMiddleware.js`

#### 问题描述

当前 Perception Agent 将采样点的 **8张全向街景图** 全部传给 VLM，存在三个问题：

1. **图片数量过多** — 8张图全部传入，Token消耗大，且无关信息可能干扰VLM判断
2. **没有方向标注** — VLM不知道每张图对应什么方向，无法建立空间认知
3. **没有根据用户朝向筛选** — 用户到达节点时的实际朝向是可以推断的，应该只传 facing direction 及其周边相关图片

#### 当前实现（问题代码）

```javascript
// perceptionAgent.js 第192-208行
function extractImagePaths(point) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const paths = [];
    directions.forEach(dir => {
        if (point.images[dir]) {
            paths.push(point.images[dir]);  // 只推路径，不带方向标签
        }
    });
    return paths;  // 8张图全传
}
```

```javascript
// llmClient.js 第151-166行 (Gemini实现)
for (const imagePath of imagePaths) {
    const { base64, mimeType } = await loadImageAsBase64(imagePath);
    contents.push({ inlineData: { data: base64, mimeType } });
}
contents.push({ text: prompt });
// 图片裸传，prompt中没有标注每张图的方向
```

#### 建议修复方案

**步骤1：在 spatialMiddleware 中计算用户朝向**

从 `polyline` 计算用户进入该节点时的实际航向角：

```javascript
// 新增函数
function calculateUserHeading(node, prevNode) {
    // 方法1：从当前节点polyline取最后一段方向
    if (node.polyline) {
        const coords = parsePolyline(node.polyline);
        if (coords.length >= 2) {
            const last = coords[coords.length - 1];
            const secondLast = coords[coords.length - 2];
            return calculateBearing(secondLast, last);
        }
    }
    // 方法2：从前一节点到当前节点的方向
    if (prevNode && node.lat && node.lng) {
        return calculateBearing(prevNode, node);
    }
    // 兜底：使用orientation字段
    return orientationToAngle(node.orientation);
}

function angleToDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(angle / 45) % 8;
    return directions[index];
}
```

**步骤2：根据用户朝向和场景类型筛选图片**

```javascript
function selectRelevantImages(node, prevNode, imagePaths) {
    // 1. 推断用户朝向
    const userHeading = calculateUserHeading(node, prevNode);
    const facingDir = angleToDirection(userHeading); // 如 'N'
    
    // 2. 根据场景类型选择相关方向
    let relevantDirs;
    if (isIntersection(node)) {
        // 路口： facing + 左右 + 对面
        relevantDirs = getFacingAndFlanking(facingDir); // ['NW','N','NE']
        relevantDirs.push(getOppositeDirection(facingDir)); // + 'S'
    } else if (isTerrainFeature(node)) {
        // 地形： facing + 左右（寻找入口）
        relevantDirs = getFacingAndFlanking(facingDir); // ['NW','N','NE']
    } else {
        // 路段： facing + 左右
        relevantDirs = getFacingAndFlanking(facingDir);
    }
    
    return {
        selectedPaths: imagePaths.filter(path => {
            const dir = extractDirectionFromPath(path); // 从文件名提取 N/NE/E
            return relevantDirs.includes(dir);
        }),
        facingDirection: facingDir,
        annotatedDirections: relevantDirs
    };
}
```

**步骤3：在 prompt 中标注每张图的方向**

```javascript
// llmClient.js 中修改
function buildAnnotatedPrompt(prompt, imagePaths, facingDir, annotatedDirs) {
    let annotatedPrompt = prompt + "\n\n以下街景图按方位排列，用户当前面向【" + facingDir + "】方向：\n";
    imagePaths.forEach((path, index) => {
        const dir = extractDirectionFromPath(path);
        const relativePos = getRelativePosition(dir, facingDir); // "正前方"/"左手侧"/"右手侧"/"正后方"
        annotatedPrompt += `[图${index+1}]: ${dir}方向 — 用户${relativePos}\n`;
    });
    return annotatedPrompt;
}
```

**Prompt 中的标注示例：**

```
以下街景图按方位排列，用户当前面向【北(N)】方向：

[图1]: 西北(NW)方向 — 用户左手侧
[图2]: 北(N)方向 — 用户正前方
[图3]: 东北(NE)方向 — 用户右手侧
[图4]: 南(S)方向 — 用户正后方（过马路时需观察对面）
```

#### 影响范围

| 文件 | 修改内容 |
|------|---------|
| `spatialMiddleware.js` | 新增 `calculateUserHeading()`, `angleToDirection()`；节点增加 `heading` 字段 |
| `perceptionAgent.js` | 新增 `selectRelevantImages()`；替换 `extractImagePaths()` |
| `llmClient.js` | 支持传入方向标注信息，构建 annotated prompt |
| `sceneScoutPrompts.js` | 提示词模板中增加方向标注说明（告知VLM图片已标注方向） |

#### 与 Issue #3 的关系

- Issue #3 引入的 `sample` 类型节点（直路采样点）也需要方向推断
- `sample` 节点的图片筛选可以更简单（只传 facing ±1 张）
- 方向推断逻辑应放在 `spatialMiddleware` 中统一计算，供所有节点类型使用

#### 与 Issue #4 的关系

- 方向推断和筛选逻辑是主从Agent架构中 "Master Agent 预处理" 的一部分
- 当前放在 `spatialMiddleware` 中实现，中期可迁移到 `MasterAgent`

---

### Issue #6: Agent 缺乏实例化和注册机制，所有场景共用同一套逻辑

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/agents/` 目录整体架构

#### 问题描述

当前 `agents/` 目录下只有2个文件：

```
agents/
├── perceptionAgent.js          # 一个函数 enrichNodes()
└── languageOptimizerAgent.js   # 一个函数 generateBroadcast()
```

**现状问题：**

| 维度 | 现状 | 应有状态 |
|------|------|----------|
| **Agent实例** | ❌ 没有，只有函数 | ✅ 不同场景应有不同Agent实例 |
| **Agent注册** | ❌ 没有，直接 `require` 调用 | ✅ 注册中心根据场景类型自动分发 |
| **Agent分类** | ❌ 没有，所有场景共用 `perceptionAgent` | ✅ 路口Agent、地形Agent、路段Agent、目的地Agent |
| **统一接口** | ❌ 没有契约定义 | ✅ 所有Agent实现相同的 `analyze()` 接口 |
| **状态/记忆** | ❌ 无状态，每次调用独立 | 中期可扩展 |

**当前代码的实际执行：**

```javascript
// perceptionAgent.js — 所有节点走同一个函数
async function enrichNodes(keyNodes) {
    for (const node of keyNodes) {
        // 1. 取坐标
        // 2. 查街景
        // 3. 选提示词（只是换prompt！）
        const promptSelection = selectPromptForNode(node);
        // 4. 调LLM
        const result = await analyzeWithLLM(prompt, imagePaths, node);
    }
}
```

路口、天桥、地下通道、路段——**全部走同一套代码**，只是提示词不同。

#### 建议修复方案

**现阶段目标：** 搭好框架（注册中心 + 分类Agent + 统一接口），具体实现可后续优化。

**1. 新增 Agent 注册中心**

```javascript
// agents/index.js — Agent注册中心
const IntersectionAgent = require('./intersectionAgent');
const TerrainAgent = require('./terrainAgent');
const PathSegmentAgent = require('./pathSegmentAgent');
const DestinationAgent = require('./destinationAgent');

const AGENT_REGISTRY = {
    'intersection': IntersectionAgent,    // 路口/斑马线
    'overpass': TerrainAgent,             // 天桥
    'underpass': TerrainAgent,            // 地下通道
    'steps': TerrainAgent,                // 台阶/阶梯
    'path': PathSegmentAgent,             // 普通路段
    'destination': DestinationAgent,      // 目的地
};

function getAgent(sceneType) {
    return AGENT_REGISTRY[sceneType] || AGENT_REGISTRY['path'];
}

module.exports = { getAgent, AGENT_REGISTRY };
```

**2. 各Agent实现统一接口**

```javascript
// agents/intersectionAgent.js — 路口Agent
async function analyze(node, imagePaths, heading) {
    // 路口专用：关注信号灯、斑马线、盲道、车流
    const prompt = buildIntersectionPrompt(node, heading);
    const images = selectRelevantImages(imagePaths, heading, 'intersection');
    return await llmClient.generateContent(prompt, images, { modelType: 'vision' });
}
module.exports = { analyze };
```

```javascript
// agents/terrainAgent.js — 地形Agent（天桥/地下通道/台阶）
async function analyze(node, imagePaths, heading) {
    // 地形专用：关注台阶、扶手、入口宽度、坡度
    const prompt = buildTerrainPrompt(node, heading);
    const images = selectRelevantImages(imagePaths, heading, 'terrain');
    return await llmClient.generateContent(prompt, images, { modelType: 'vision' });
}
module.exports = { analyze };
```

```javascript
// agents/pathSegmentAgent.js — 路段Agent
async function analyze(node, imagePaths, heading) {
    // 路段专用：关注路面、盲道连续性、障碍物
    const prompt = buildPathPrompt(node, heading);
    const images = selectRelevantImages(imagePaths, heading, 'path');
    return await llmClient.generateContent(prompt, images, { modelType: 'vision' });
}
module.exports = { analyze };
```

```javascript
// agents/destinationAgent.js — 目的地Agent
async function analyze(node, imagePaths, heading) {
    // 目的地专用：关注最后接近策略、入口定位
    const prompt = buildDestinationPrompt(node, heading);
    const images = selectRelevantImages(imagePaths, heading, 'destination');
    return await llmClient.generateContent(prompt, images, { modelType: 'vision' });
}
module.exports = { analyze };
```

**3. 改造 perceptionAgent.js 为调度层**

```javascript
// agents/perceptionAgent.js — 改造为Master调度层
const { getAgent } = require('./index');

async function enrichNodes(nodes) {
    for (const node of nodes) {
        // 1. 确定场景类型
        const sceneType = determineSceneType(node); // 基于walk_type/action
        
        // 2. 从注册中心获取对应Agent
        const agent = getAgent(sceneType);
        
        // 3. 获取街景图
        const imagePaths = await fetchStreetViewImages(node);
        
        // 4. 获取用户朝向
        const heading = node.heading;
        
        // 5. 调用Agent分析
        const result = await agent.analyze(node, imagePaths, heading);
        
        // 6. 附加结果
        node.perception_data = result;
    }
}
```

#### 影响范围

| 文件 | 操作 | 说明 |
|------|------|------|
| 新增 `agents/index.js` | 创建 | Agent注册中心 |
| 新增 `agents/intersectionAgent.js` | 创建 | 路口Agent |
| 新增 `agents/terrainAgent.js` | 创建 | 地形Agent（天桥/地下通道/台阶） |
| 新增 `agents/pathSegmentAgent.js` | 创建 | 路段Agent |
| 新增 `agents/destinationAgent.js` | 创建 | 目的地Agent |
| 改造 `agents/perceptionAgent.js` | 修改 | 改为Master调度层 |
| `sceneScoutPrompts.js` | 修改 | 提示词构建函数按Agent拆分 |

#### 与 Issue #4 的关系

- Issue #4 关注的是"选择逻辑"（怎么判断场景类型）
- Issue #6 关注的是"架构框架"（选好类型后怎么找到对应的Agent）
- **先修复 Issue #4（确定场景类型），再修复 Issue #6（根据类型分发到Agent）**

#### 与 Issue #5 的关系

- Issue #5 的方向筛选逻辑（`selectRelevantImages`）应下沉到各Agent内部
- 不同Agent可根据自身需求选择不同的图片筛选策略

#### 中期扩展方向

| 阶段 | 目标 |
|------|------|
| **现阶段** | 搭好注册中心 + 分类Agent + 统一接口，内部还是直接调LLM |
| **中期** | 各Agent内部增加专业化逻辑（如TerrainAgent分析台阶数量、入口宽度） |
| **远期** | 引入真正的主从协作（Master Agent做任务分解、结果整合、冲突检测） |

---

### Issue #7: 主Agent缺乏路径全程观，无法统筹整合信息

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/agents/languageOptimizerAgent.js`, `backend/prompts/defensivePrompts.js`, `backend/middleware/spatialMiddleware.js`

#### 问题描述

当前所谓的"主Agent"（`languageOptimizerAgent.js`）实际上只是**将节点数据格式化为prompt后调用LLM**，完全没有"路径全程观"：

1. **不知道路线整体特征** — 全程有几个天桥？几个地下通道？几个路口？当前代码完全不知道
2. **没有节点间关系分析** — "上天桥"和"下天桥"是否配对？连续路口是否属于同一交叉口？
3. **没有全局风险统计** — 全程有几处无盲道？几处机非混行？几处需要上台阶？
4. **没有信息冲突检测** — 子Agent A说"有盲道"，子Agent B说"无盲道"，主Agent没有识别

#### 当前实现（问题代码）

```javascript
// languageOptimizerAgent.js 第136-188行
function enhanceIRWithPerception(irData) {
    const enhanced = {
        ...irData,
        key_nodes: irData.key_nodes.map(node => {
            // 只是简单合并hazards，没有任何全局分析！
            if (node.perception_data && node.perception_data.analysis) {
                const additionalHazards = [];
                if (analysis.parsed.hazards) {
                    additionalHazards.push(...analysis.parsed.hazards);
                }
                // ... 仅此而已
                return { ...node, hazards: allHazards };
            }
            return node;
        })
    };
    return enhanced;
}
```

```javascript
// defensivePrompts.js 第41-98行
function getUserPrompt(irData) {
    // 只是简单罗列每个节点的信息，没有全局概览
    return `【路线概要】
- 总距离：${summary.total_distance}
- 关键节点数：${nodes.length}个

【关键节点序列】
节点1: ...
节点2: ...
`;
}
```

#### 高德API返回的数据是否够用？

**当前使用的高德数据：**
- `route.paths[0].distance` — 总距离
- `route.paths[0].duration` — 总时间
- `route.paths[0].steps[]` — 路段列表（含instruction/action/road/distance/orientation/polyline/walk_type）

**缺失的信息：**
- ❌ 没有"全程有几个天桥/地下通道"的统计
- ❌ 没有路段之间的拓扑关系（如天桥的入口和出口配对）
- ❌ 没有周边POI信息（如"附近有地铁站""附近有医院"）
- ❌ 没有实时路况（施工、封路）
- ❌ 没有地形高程数据（坡度信息）

#### 主Agent应该具备的能力

**1. 路径全局分析（基于现有数据即可实现）**

```javascript
function analyzeRouteGlobally(irData) {
    const nodes = irData.key_nodes;
    
    return {
        // 统计信息
        stats: {
            total_overpass: nodes.filter(n => n.walk_type === 4).length,
            total_underpass: nodes.filter(n => n.walk_type === 3).length,
            total_crossings: nodes.filter(n => n.walk_type === 1).length,
            total_steps: nodes.filter(n => n.walk_type === 20).length,
            total_turns: nodes.filter(n => ['左转','右转'].includes(n.action)).length,
        },
        
        // 节点配对（如天桥入口→出口）
        pairs: findNodePairs(nodes), // 识别上下天桥、进出地下通道等配对
        
        // 风险聚合
        risk_summary: {
            no_tactile_paving_count: nodes.filter(n => n.hazards?.includes('无盲道')).length,
            mixed_traffic_count: nodes.filter(n => n.hazards?.includes('机非混行')).length,
            stair_count: nodes.filter(n => n.hazards?.includes('台阶')).length,
        },
        
        // 连续路段分析
        segments: analyzeContinuousSegments(nodes), // 哪段路最长？哪段最复杂？
    };
}
```

**2. 信息冲突检测**

```javascript
function detectConflicts(nodes) {
    const conflicts = [];
    
    // 示例：入口说有盲道，出口说没有
    const overpassPairs = findOverpassPairs(nodes);
    for (const pair of overpassPairs) {
        const entrance = pair[0];
        const exit = pair[1];
        if (entrance.perception_data?.has_tactile_paving && 
            !exit.perception_data?.has_tactile_paving) {
            conflicts.push({
                type: 'tactile_paving_mismatch',
                nodes: [entrance.node_index, exit.node_index],
                description: '天桥入口有盲道，出口无盲道，可能存在中断'
            });
        }
    }
    
    return conflicts;
}
```

**3. 增强后的Prompt（供Language Optimizer使用）**

```
【路线全局概览】
全程800米，预计12分钟。路线包含：1座天桥、2个路口、1段地下通道。
主要风险：2处无盲道、1处机非混行、1处需上台阶。

【节点配对关系】
- 天桥（节点3→节点5）：入口有盲道，出口无盲道，注意中断
- 地下通道（节点7→节点8）：双向均有扶手

【关键节点序列】
...
```

#### 是否需要请求更多地图信息？

**现有高德数据 + 街景分析 基本够用**，但可以考虑补充：

| 信息类型 | 来源 | 优先级 | 用途 |
|----------|------|--------|------|
| 周边POI | 高德POI搜索API | 低 | "附近有地铁站可作为地标" |
| 实时路况 | 高德交通API | 中 | 避开施工路段 |
| 地形高程 | 高德无此数据 | 低 | 坡度预警 |
| 建筑物轮廓 | 高德无此数据 | 低 | 触觉边界描述 |

**建议：** 现阶段先基于现有数据做好全局分析，后续再考虑补充POI等信息。

#### 与 Issue #4 / Issue #6 的关系

- Issue #4 / #6 讨论的是"子Agent分类和注册"
- Issue #7 讨论的是"主Agent应该做什么"
- **关系：** 子Agent负责"局部分析"，主Agent负责"全局统筹"

```
Master Agent (Issue #7)
    ├── 全局分析：统计、配对、冲突检测
    ├── 任务分配：调用子Agent (Issue #4/#6)
    ├── 结果整合：融合所有子Agent输出
    └── 生成结构化报告 → 传给 Language Optimizer
```

---

### Issue #8: 提示词构建存在根本性矛盾，约束与示例自相冲突

**状态：** 🟢 已修复  
**优先级：** 高  
**影响模块：** `backend/prompts/defensivePrompts.js`, `backend/prompts/templates/language-optimizer-system.md`, `backend/agents/languageOptimizerAgent.js`, `backend/services/llmClient.js`

#### 问题描述

当前提示词体系存在**三重根本性矛盾**，导致LLM输出质量不稳定，需要大量后处理（`sanitizeOutput`）来"擦屁股"。

**矛盾1：System Prompt 的"完美示例"本身违反约束法则**

`language-optimizer-system.md` 第92-97行的"完美特性"总结段落使用了 Markdown 列表符号（`* `）：

```markdown
**完美特性：**

* 极致听觉顺滑：完全剔除Markdown符号...
* 严丝合缝的时钟法则：全篇精确使用"12点钟方向"...
```

这与第49-53行的"绝对约束法则#6"直接冲突：
> "绝对禁止使用任何Markdown排版符号（如加粗 **、列表 *、分隔线 ---、标题 #）"

**矛盾2：System Prompt 和 User Prompt 的 temperature 配置冲突**

| 位置 | temperature | 说明 |
|------|-------------|------|
| `language-optimizer-system.md` 第1行 | `0.3` | "略微调高以增加自然人类语感" |
| `defensivePrompts.js` 第17行 | `0.1` | "极低温度，确保输出稳定" |
| `languageOptimizerAgent.js` 第45行 | `0.1` | 实际调用参数 |
| `languageOptimizerAgent.js` 第84行（重试） | `0.05` | "更低温度" |

System Prompt 头部声明 `temperature: 0.3`，但实际代码中 `defensivePrompts.js` 和 `languageOptimizerAgent.js` 都使用 `0.1`。更关键的是：
- **temperature 0.3** 意味着LLM有较高自由度，容易产生"创意"输出（包括Markdown、视觉词汇）
- **temperature 0.1** 意味着高度确定性，但System Prompt里的"增加自然人类语感"的期望无法达成
- 结果是：约束要求"自然流畅"，但低temperature导致输出机械；高temperature又导致违规内容增多

**矛盾3：System Prompt 同时要求"自然口语"和"严格三段式结构"**

第55-69行的"强制输出结构规范"要求：
> "必须且只能输出3到4个纯文本自然段，段落之间自然过渡，不允许携带任何小标题或项目符号"

但同时要求三段必须分别对应：
1. 宏观全局概览
2. 关键节点时序拆解
3. 最后50米盲区策略

这种"结构化但无结构标记"的要求对LLM来说非常矛盾——它需要用自然语言隐式表达三段结构，但又不能有任何标记帮助它组织。结果是LLM经常输出带Markdown的"保险"格式。

#### 当前实现（问题代码）

```javascript
// defensivePrompts.js 第171-267行 — sanitizeOutput 函数
function sanitizeOutput(text) {
    let cleaned = text;
    // 1. 去除 Markdown 格式标记（循环清理确保彻底）
    cleaned = cleaned
        .replace(/^#{1,6}\s*/gm, '')      // 去除标题标记
        .replace(/^\s*[-*+]\s*/gm, '')    // 去除列表标记
        .replace(/\*\*/g, '')             // 去除加粗标记
        // ... 共20+个正则替换
    
    // 第二轮：重复执行3次确保完全清理
    for (let i = 0; i < 3; i++) {
        cleaned = cleaned
            .replace(/\*\*/g, '')
            .replace(/\*([^\*]+)\*/g, '$1')
            .replace(/^\s*[-\*\+]\s*/gm, '');
    }
    // ... 禁用词表、空白清理等
}
```

```javascript
// defensivePrompts.js 第275-293行 — validateOutput 函数
function validateOutput(text) {
    const checks = {
        hasClockDirection: /\d{1,2}点钟方向/.test(text),  // 强制检查时钟方向
        hasThreeParagraphs: text.split('\n\n').filter(p => p.trim()).length >= 3,
        noVisualWords: !/[颜色红蓝绿黄]|看到|看见/.test(text),
        noGreetings: !/^(你好|您好)/.test(text),
        properEnding: !/(祝您|请小心|注意安全)$/.test(text)
    };
    // ...
}
```

```javascript
// languageOptimizerAgent.js 第41-50行 — LLM调用
const llmResult = await llmClient.generateContent(
    messages[2].content, // User prompt
    [],
    {
        temperature: 0.1,  // 与 system prompt 声明的 0.3 不一致
        topP: 0.85,
        maxTokens: 1000,
        modelType: 'text'
    }
);
```

#### 为什么 `sanitizeOutput` 需要这么多清理？

`sanitizeOutput` 函数长达97行，包含：
- 20+个正则表达式替换 Markdown 符号
- 3轮循环清理（说明单次清理不够）
- 15+个禁用词正则
- 4个空白/标点清理

这充分说明：**提示词约束没有有效传达给LLM**。如果提示词工程做得好，LLM应该直接输出合规文本，而不是需要这么多后处理。

#### 建议修复方案

**短期修复（最小改动，解决矛盾）：**

1. **修复 System Prompt 中的自相矛盾**
   - 删除"完美特性"段落中的 Markdown 列表符号（`* `）
   - 将 temperature 声明统一为实际使用的值（0.1）
   - 删除"增加自然人类语感"的表述（低temperature做不到）

2. **简化 sanitizeOutput**
   - 保留基本清理（首尾空白、重复标点）
   - 删除大量 Markdown 正则（修复提示词后LLM不应再输出Markdown）
   - 保留禁用词检查（作为安全网而非主力防线）

3. **明确结构标记策略**
   - **方案A**：允许LLM使用简单的段落分隔（空行），在System Prompt中明确教导"用空行分隔段落"
   - **方案B**：在User Prompt中给出更明确的段落边界提示（如"第一段结束。第二段开始："）

**中期改进（重构提示词体系）：**

1. **分离"约束"和"风格"**
   - 约束（必须做什么/禁止做什么）→ 放在 System Prompt 最前面，用 bullet list（对开发者可读，LLM也理解）
   - 风格（如何表达）→ 放在 Few-Shot 示例中让LLM学习

2. **增加"格式护栏"示例**
   - 在 Few-Shot 中增加一个"错误输出→正确输出"的对比示例
   - 明确展示：如果输出带Markdown会怎样被惩罚

3. **考虑使用 JSON 模式或结构化输出**
   - 如果模型支持（如Gemini的JSON模式），要求LLM输出JSON：
   ```json
   {
     "paragraphs": [
       "宏观概览文本...",
       "关键节点文本...",
       "最后50米文本..."
     ]
   }
   ```
   - 后端将JSON拼接为纯文本，彻底避免格式问题

#### 影响范围

| 文件 | 修改内容 |
|------|---------|
| `language-optimizer-system.md` | 修复矛盾：统一temperature声明、删除Markdown示例、明确段落分隔策略 |
| `defensivePrompts.js` | 简化`sanitizeOutput`；`validateOutput`增加JSON模式支持 |
| `languageOptimizerAgent.js` | 统一temperature参数；支持JSON模式解析 |
| `llmClient.js` | 增加`responseFormat: 'json'`选项（如模型支持） |

#### 与 Issue #2 的关系

- Issue #2 讨论删除"时钟方向"
- 如果 Issue #2 执行，`validateOutput` 中的 `hasClockDirection` 检查需要同步删除
- 建议 **先决定 Issue #2 的方向，再修复 Issue #8**

---

## 待补充问题

（后续审查中发现的问题将在此追加）

---

## 修复计划

| Issue | 负责人 | 预计修复时间 | 实际完成时间 |
|-------|--------|-------------|-------------|
| #1 spatialMiddleware结构化字段利用 | Claude | 2026-04-30 | 2026-04-30 |
| #2 时钟方向转换逻辑多余且准确性存疑 | Claude | 2026-04-30 | 2026-04-30 |
| #3 直行路段缺少离散采样点 | Claude | 2026-04-30 | 2026-04-30 |
| #4 子Agent选择逻辑过于简单 | Claude | 2026-04-30 | 2026-04-30 |
| #5 Perception Agent传入8张全向街景图 | Claude | 2026-04-30 | 2026-04-30 |
| #6 Agent缺乏实例化和注册机制 | Claude | 2026-04-30 | 2026-04-30 |
| #7 主Agent缺乏路径全程观 | Claude | 2026-04-30 | 2026-04-30 |
| #8 提示词构建存在根本性矛盾 | Claude | 2026-04-30 | 2026-04-30 |

---

## 备注

- 所有修复应在统一分支上进行，避免分散修改
- 修复后需补充对应的单元测试
- 修改 `isKeyNode` 逻辑后，需用真实高德返回数据验证过滤效果
