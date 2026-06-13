好的，基于你提供的路径信息，我为你设计一套完整的**语义标签注入 + GraphHopper 引擎管理**方案。该方案涵盖目录结构、数据结构、工作流程、关键代码示例以及乒乓切换策略。

---

## 一、目录结构约定

```
D:\project_file\CorSight_Navigation\CorSight_v1.0\
│
├── osm_data\                              # 地图数据工作区
│   ├── guangdong-260611.osm.pbf           # 原始底图（只读，作为基础）
│   ├── workspace.osm                      # 可编辑的 XML 副本（核心工作文件）
│   ├── workspace.osm.backup               # 自动备份
│   ├── workspace_updated.osm              # 应用补丁后的临时文件
│   ├── workspace.pbf                      # 最终供 GraphHopper 使用的 PBF
│   ├── graph-cache-guangzhou_1\           # GraphHopper 1号索引目录
│   ├── graph-cache-guangzhou_2\           # 2号索引目录（用于乒乓切换）
|   ├── changes_new.osc                    # 每次生成的 OSC 补丁文件
│   └── history_osc\                       # 历史补丁
|   
│
├── graphhopper\                           # GraphHopper 引擎目录
│   ├── graphhopper-web-10.0.jar
│   ├── config.yml                         # GraphHopper 配置文件（动态生成）
│   └── logs\
│
├── CorSight-Server_v2.0\   
|    └──backend\                               # Node.js 后端
│       ├── services\
│       │   ├── osmPatchService.js             # 调用 Python 脚本生成补丁
│       │   ├── graphHopperService.js          # 控制引擎重启/乒乓切换
│       │   └── semanticProcessingService.js   # VLM 分析 + 触发注入
│       ├── scripts\                           # Python 辅助脚本
│       │   └── generate_osc.py                # 坐标匹配 + 生成 OSC
│       └── ...
│
└── ...
```

---

## 二、数据结构设计

### 2.1 MongoDB 集合：`semantic_tags`

存储 VLM 提取的视障语义标签，每条记录对应一个采样点（point_id）。结构如下：

```javascript
{
  "_id": ObjectId,
  "point_id": "P_1744567890123_a3f5",     // 与上传时一致
  "location": {
    "type": "Point",
    "coordinates": [113.2644, 23.1291]    // [lng, lat]
  },
  "tags": {
    "tactile_paving": "yes",              // 盲道有无
    "surface": "asphalt",                 // 路面材质
    "obstacle": ["construction"],         // 临时障碍物（动态）
    "auditory_signal": "yes",             // 有声信号灯
    "sidewalk_width": 2.5,                // 宽度（米）
    "curb_ramp": "yes",                   // 路缘坡道
    "steps": 0,                           // 台阶数
    "lit": "yes"                          // 照明
  },
  "matched_osm_id": 12345678,             // 匹配到的 OSM 元素 ID（way/node）
  "matched_osm_type": "way",              // "way" 或 "node"
  "match_distance_m": 3.2,                // 匹配距离（米）
  "status": "pending",                    // pending / patched / failed
  "created_at": ISODate(...),
  "updated_at": ISODate(...)
}
```

- **索引**：`location` 使用 `2dsphere` 索引，`status` 普通索引。
- `matched_osm_id` 和 `matched_osm_type` 由 Python 脚本填充。
- `tags` 中的键尽量采用 OSM 标准标签，以便 GraphHopper 的 `custom_model` 直接使用。

### 2.2 临时存储：`osm_working_state`

记录当前工作区状态，用于协调乒乓切换：

```javascript
{
  "_id": "current_state",
  "current_pbf": "workspace.pbf",
  "current_cache": "graph-cache-guangzhou",
  "pending_pbf": null,
  "pending_cache": null,
  "last_patch_time": ISODate(...),
  "rebuild_in_progress": false
}
```

---

## 三、语义标签注入工作流（自动化）

### 3.1 触发条件

- 定时任务（如每 30 分钟）或每当累积了 N 个新标签（如 20 个）时，启动注入流程。
- 也可手动通过管理 API 触发。

### 3.2 详细步骤

#### Step 0：准备环境
- 确保 `osm_data/workspace.osm` 存在（如不存在则从 `guangdong-260611.osm.pbf` 转换得到）。
- 确保 Python 环境已安装 `shapely`、`osmium`、`pymongo`。

#### Step 1：从 MongoDB 获取未处理的标签
```javascript
// backend/services/semanticProcessingService.js
const pendingTags = await db.collection('semantic_tags').find({ status: 'pending' }).toArray();
if (pendingTags.length === 0) return;
```

#### Step 2：调用 Python 脚本生成 OSC 补丁
```javascript
const { exec } = require('child_process');
const scriptPath = path.join(__dirname, '../scripts/generate_osc.py');
const args = [
  `--mongodb-uri`, process.env.MONGODB_URI,
  `--osm-file`, path.join(OSM_DATA_DIR, 'workspace.osm'),
  `--output`, path.join(OSM_DATA_DIR, 'changes.osc'),
  `--point-ids`, pendingTags.map(t => t.point_id).join(',')
];
exec(`python ${scriptPath} ${args.join(' ')}`, (err, stdout, stderr) => {
  if (err) throw new Error('OSC generation failed');
  console.log(stdout);
});
```

Python 脚本职责：
- 连接 MongoDB，读取指定 `point_id` 的坐标和标签。
- 使用 `osmium` 或 `shapely` 解析 `workspace.osm`，找到每个坐标最近的 way 或 node。
- 生成 OSC 文件，内容为 `<modify>` 元素，添加 `tag`。如果元素原本没有标签则新增；如果已有则覆盖（也可合并）。
- 将匹配到的 `osm_id` 和 `type` 写回 MongoDB（更新 `matched_osm_id` 字段）。

#### Step 3：应用补丁到工作区 `.osm` 文件
```cmd
osmium apply-changes workspace.osm changes.osc -o workspace_updated.osm
```
- 如果成功，备份原 `workspace.osm` 为 `workspace.osm.backup`，然后将 `workspace_updated.osm` 重命名为 `workspace.osm`。

#### Step 4：生成新的 PBF 文件
```cmd
osmium cat workspace.osm -o workspace.pbf
```
- 这个 `workspace.pbf` 将成为 GraphHopper 下次使用的底图。

#### Step 5：更新 MongoDB 标签状态
将所有参与本次注入的标签状态改为 `patched`。

#### Step 6：触发 GraphHopper 乒乓重建
- 见下一章。

---

## 四、GraphHopper 乒乓切换方案

### 4.1 目标
- 更新地图数据（PBF）后，让 GraphHopper 以新数据重建索引，且**不中断正在进行的路线规划请求**。

### 4.2 实现方式

我们维护两个 GraphHopper 实例（或同一实例的两个配置，不同端口 + 不同 `graph.location`）。但简单场景可仅通过**修改配置 + 重启**实现，代价是几秒钟的停机。乒乓切换可做到零停机，这里描述完整版。

#### 方案 A：简单重启（开发/测试可用）
1. 停止 GraphHopper 进程。
2. 修改 `config.yml` 中的 `datareader.file` 指向新的 `workspace.pbf`，并清理 `graph.location` 目录（或指向新空目录）。
3. 启动 GraphHopper（重建索引）。
4. **缺点**：重建索引期间（5-10分钟）服务不可用。

#### 方案 B：乒乓目录 + 进程轮换（推荐生产）
- 准备两个配置文件：`config-A.yml` 和 `config-B.yml`，分别指向：
  - `graph.location: /path/to/graph-cache-A`，端口 8989
  - `graph.location: /path/to/graph-cache-B`，端口 8990
- 初始时运行实例 A（端口 8989），Node.js 后端调用 `http://localhost:8989`。
- 当需要更新地图时：
  1. 用新 PBF 启动实例 B（`java -jar ... server config-B.yml`），此时实例 B 在后台构建索引（约 5-10 分钟）。
  2. 定期检查实例 B 的 `/health` 端点，直到就绪。
  3. 修改 Node.js 后端的 `GRAPHHOPPER_URL` 环境变量，热重载或重启 Node 服务（或使用 Nginx 切换 upstream）。
  4. 停止实例 A。下次更新时互换角色。

#### Node.js 控制代码示例
```javascript
// backend/services/graphHopperService.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class GraphHopperManager {
  constructor() {
    this.currentPort = 8989;
    this.otherPort = 8990;
    this.processes = {};
  }

  async rebuildWithNewPbf(newPbfPath) {
    // 生成新的 config 文件，指向 newPbfPath 和新的缓存目录
    const newConfig = this.generateConfig(newPbfPath, `graph-cache-${Date.now()}`);
    const configPath = path.join(GRAPHOPPER_DIR, `config-temp.yml`);
    fs.writeFileSync(configPath, newConfig);

    // 启动新实例（后台）
    const child = spawn('java', ['-Xmx4g', '-jar', 'graphhopper-web-10.0.jar', 'server', configPath], {
      cwd: GRAPHOPPER_DIR,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    const newPort = this.otherPort;
    // 等待健康检查...
    await this.waitForReady(`http://localhost:${newPort}/health`);

    // 切换 Node 后端的 GraphHopper 客户端
    process.env.GRAPHHOPPER_URL = `http://localhost:${newPort}`;
    // 可选：重启 Node 服务或热重载配置

    // 停止旧进程
    if (this.processes[this.currentPort]) {
      this.processes[this.currentPort].kill();
    }
    // 更新当前端口
    this.currentPort = newPort;
    this.otherPort = (newPort === 8989 ? 8990 : 8989);
  }
}
```

---

## 五、GraphHopper 自定义权重配置

在 Node.js 后端调用 `/route` 时，动态附上 `custom_model`，利用我们注入的标签：

```json
{
  "priority": [
    { "if": "tactile_paving == yes", "multiply_by": 1.5 },
    { "if": "tactile_paving == no", "multiply_by": 0.8 },
    { "if": "surface == cobblestone", "multiply_by": 0.5 },
    { "if": "steps > 0", "multiply_by": 0.01 }
  ],
  "speed": [
    { "if": "surface == asphalt", "multiply_by": 1.2 }
  ]
}
```

- 标签名需与 OSM 标准一致，或使用自定义键（如 `corsight:blind_health`），但后者需要 GraphHopper 配置 `custom_model` 时额外注册。
- 建议先全部采用标准标签，这样即使不用自定义模型，也能被其他 OSM 工具识别。

---

## 六、错误处理与监控

- **Python 脚本匹配失败**：将标签状态标记为 `failed`，并记录 `error` 字段，稍后重试。
- **OSC 应用冲突**：如果 `osmium apply-changes` 因为版本冲突失败（例如元素已被修改），则放弃本次注入，记录日志，人工介入或使用 `osmium merge` 合并变更。
- **GraphHopper 启动超时**：设置健康检查超时（例如 10 分钟），超时则回滚，保留旧实例。
- **磁盘空间监控**：定期清理旧的 graph-cache 和备份文件。

---

## 七、总结

| 组件 | 职责 |
|------|------|
| **MongoDB** | 存储语义标签，记录匹配状态 |
| **Python 脚本** | 坐标匹配，生成 OSC 补丁 |
| **Node.js 后端** | 调度注入流程，控制 GraphHopper 乒乓切换 |
| **osmium 工具** | 格式转换、应用补丁 |
| **GraphHopper** | 路线计算，读取带标签的 PBF |

## 八、补充说明

### `osmium-tool` 在方案中的核心地位

在**语义标签注入工作流**中，`osmium-tool`（即你已编译出的 `osmium.exe`）负责以下关键任务：

| 任务 | 命令 | 说明 |
|------|------|------|
| PBF → OSM | `osmium cat input.pbf -o output.osm` | 将二进制地图文件转为可编辑的 XML |
| OSM → PBF | `osmium cat input.osm -o output.pbf` | 将修改后的 XML 转回二进制 |
| 应用 OSC 补丁 | `osmium apply-changes base.osm changes.osc -o updated.osm` | 将标签修改合并到工作区 |
| 文件信息查看 | `osmium fileinfo file.pbf` | 验证地图数据完整性 |
| 提取特定区域 | `osmium extract` | 可选，裁剪地图 |

这些操作**无法用纯 Python 高效完成**（Python 的 `osmium` 包主要提供读取和迭代，修改和写入能力有限，且性能差）。因此，`osmium-tool` 是整个链路中不可替代的组件。

### Python 脚本的定位（只做“匹配 + 生成 OSC”）

Python 脚本只负责从 MongoDB 读取标签，匹配 OSM 元素，**生成 OSC 补丁文件**（XML 格式）。它不负责转换格式或应用补丁。例如：

```python
# generate_osc.py 输出 changes.osc
<osmChange version="0.6">
  <modify>
    <way id="12345678" version="1">
      <tag k="tactile_paving" v="yes"/>
    </way>
  </modify>
</osmChange>
```

之后，Node.js 调用 `osmium apply-changes` 应用补丁。

### 完整链路（明确 osmium-tool 的地位）

```
Node.js 服务（semanticProcessingService）
    │
    ├─ 调用 Python 脚本 → 生成 changes.osc
    │
    ├─ 执行 osmium apply-changes workspace.osm changes.osc -o workspace_updated.osm
    │
    ├─ 执行 osmium cat workspace_updated.osm -o workspace.pbf
    │
    └─ 通知 GraphHopper 使用新的 workspace.pbf 重建索引
```

每一步中的 `osmium` 命令都是你编译好的 `osmium.exe`。

### 结论

- **`osmium-tool` 是核心**：负责格式转换、补丁应用。
- **Python 脚本是辅助**：只做几何匹配和 OSC 生成，不触碰地图文件本身。
- **两者配合**，才能完成从语义标签到地图数据更新的闭环。
