## 一、FOV参与视野计算的具体实现

### 1.1 视野扇区几何计算
已知采集点坐标 `(lon, lat)`、设备水平FOV `fov_h`（度）、拍摄方位角 `bearing`（0~360°，0°为正北），需要计算该张图片在地理上覆盖的**扇形区域**，用于检索OSM元素。

**简化模型**（适用于中短距离，忽略地球曲率）：
- 扇形圆心角 = `fov_h`
- 扇形方向 = `bearing`（扇形的中心线）
- 扇形半径 = 根据实际需求设定（例如50米，覆盖人行道宽度）

**计算步骤**：
1. 将经纬度转换为平面坐标（可使用UTM投影或近似等距离投影）。
2. 根据 `bearing` 和 `fov_h/2` 计算出扇形的左右边界角度：`left_angle = bearing - fov_h/2`，`right_angle = bearing + fov_h/2`。
3. 生成扇形的多个边界点（例如每隔10°取一个点，半径为R），再转回经纬度。
4. 得到一个多边形（扇形），用于空间查询。

**实现建议**：使用 Turf.js（Node.js 端）或 Shapely（Python）来完成几何计算和空间查询。

### 1.2 基于FOV的OSM元素检索
在生成视野多边形后，通过 Overpass API 或本地 PostGIS 查询该区域内包含的 OSM 元素：
```ql
[out:json];
way(poly:"polygon_str")[highway~"footway|steps|crossing|pedestrian"];
out geom;
```
得到的结果包括元素的类型和标签，用于场景分类。

---

## 二、场景分类器逻辑（精确匹配）

### 2.1 输入数据
- 图片的 `bearing`、`fov`、`point_id`。
- 从高德路线规划中获得的 `walk_type`（如果该点属于某条规划路线的一部分）。
- 从视野扇区内检索到的 OSM 元素列表（包含 `highway`、`footway`、`bridge` 等标签）。

### 2.2 分类决策规则（优先级从高到低）
| 条件 | 场景类型 | 分配的Agent |
|------|----------|-------------|
| OSM有 `highway=steps` 或高德 `walk_type=20/21` | 台阶 | StepsAgent |
| OSM有 `highway=crossing` 或高德 `walk_type=1` | 人行横道 | CrossingAgent |
| OSM有 `bridge=yes` 或高德 `walk_type=4` | 天桥 | OverpassAgent |
| OSM有 `railway=subway_entrance` | 地铁入口 | SubwayEntranceAgent |
| OSM有 `highway=footway` + 无特殊标签 | 普通路段 | PathAgent |
| 其他 | 通用 | GenericAgent |

如果多个条件同时满足（例如台阶也在天桥上），则选择最细粒度的 Agent（如台阶优先于天桥），因为台阶对视障更关键。

### 2.3 实现方式（Node.js 后端）
在 `semanticProcessingService` 中，获取待处理图片后，调用一个 `classifyScene(point_id, bearing, fov)` 函数：
```javascript
async function classifyScene(pointId, bearing, fov) {
    const point = await getPointCoordinates(pointId);
    const polygon = computeViewSectorPolygon(point, bearing, fov, RADIUS=50);
    const osmElements = await fetchOSMElementsInPolygon(polygon);
    const walkType = await getWalkTypeFromRoute(pointId); // 从预先存储的路线数据中读取
    return applyClassificationRules(osmElements, walkType);
}
```

---

## 三、MongoDB 数据结构更新

### 3.1 `upload_sessions` 集合（临时存储，已有）
需增加字段以支持FOV和批量处理：
```javascript
{
  "session_id": "S_xxx",
  "point_id": "P_xxx",
  "location": { "type": "Point", "coordinates": [lng, lat] },
  "images": [
    {
      "bearing": 45,
      "fov": 90,                      // 新增：该图片的水平视场角
      "description": "前方天桥",
      "uploaded": false,
      "path": null,
      "scene_type": null,             // 新增：分类结果，待填充
      "status": "pending"
    }
  ],
  "batch_id": null,                   // 新增：所属批量任务ID
  "status": "metadata_received",
  "created_at": ISODate(...),
  "updated_at": ISODate(...)
}
```

### 3.2 `semantic_tags` 集合（永久存储）
```javascript
{
  "point_id": "P_xxx",
  "location": { "type": "Point", "coordinates": [lng, lat] },
  "images": [
    {
      "bearing": 45,
      "fov": 90,
      "path": "/images/xxx.jpg",
      "scene_type": "overpass",        // 分类结果
      "agent_name": "overpass_agent",
      "osm_tags": { "highway": "steps", "step_count": 15 },
      "description": "天桥有两段台阶，右侧有扶手",
      "confidence": 0.92
    }
  ],
  "merged_osm_tags": {                 // 该采样点所有图片的合并标签（用于注入）
    "tactile_paving": "yes",
    "steps": 15,
    "handrail": "yes"
  },
  "merged_description": "天桥有两段台阶，右侧有扶手", // 供路线预览使用
  "status": "pending",                 // pending / patched / failed
  "created_at": ISODate(),
  "updated_at": ISODate()
}
```
- 每个 `images` 数组元素保存单张图片的分析结果，便于追溯。
- `merged_osm_tags` 和 `merged_description` 是对同一点所有图片的语义融合结果（例如取多数投票或合并描述）。

### 3.3 `batch_tasks` 集合（新增，管理批量推理）
```javascript
{
  "batch_id": "B_xxx",
  "created_at": ISODate(),
  "status": "pending",                // pending / processing / completed / failed
  "session_ids": ["S_xxx", "S_yyy"], // 包含的会话
  "total_images": 24,
  "processed_images": 0,
  "result_file_url": "https://...",   // 批量推理结果文件地址（JSONL）
  "error": null
}
```

---

## 四、缓存池与批量提示词构建

### 4.1 缓存池触发条件
在 `uploadSessionService` 中实现一个计数器或定时器：
- 每上传一张图片，检查当前未处理的图片数量是否达到阈值（如50张）。
- 或检查该 `session_id` 是否已收集完预期数量的图片（例如该点应上传8张）。
- 或定时（如每30分钟）扫描所有 `status='partial_upload'` 且最后更新时间超过阈值的 session。

一旦触发，创建 `batch_id`，将该批 session 的图片状态更新为 `processing`，并调用批量提示词构建函数。

### 4.2 批量提示词构建流程
```javascript
async function buildBatchPrompt(sessionIds) {
    const imageGroups = []; // [{ scene_type: "overpass", images: [{url, bearing, fov}] }]
    for (const sessionId of sessionIds) {
        const session = await getSession(sessionId);
        for (const img of session.images) {
            if (img.uploaded && !img.scene_type) {
                // 调用场景分类器（可能依赖外部API，需缓存结果）
                const sceneType = await classifyScene(session.point_id, img.bearing, img.fov);
                img.scene_type = sceneType;
                // 按场景类型分组
                imageGroups[sceneType] = imageGroups[sceneType] || [];
                imageGroups[sceneType].push({
                    point_id: session.point_id,
                    bearing: img.bearing,
                    image_url: img.path,
                    context: { walk_type: session.walk_type, osm_tags: ... }
                });
            }
        }
    }
    // 为每个场景类型生成一个 JSONL 文件（或直接调用批量API）
    for (const [sceneType, images] of Object.entries(imageGroups)) {
        const promptTemplate = getPromptTemplate(sceneType);
        const jsonlLines = images.map(img => ({
            custom_id: `${img.point_id}_${img.bearing}`,
            body: {
                model: "qwen-vl-max",
                messages: [
                    { role: "system", content: promptTemplate.system },
                    { role: "user", content: [
                        { type: "text", text: promptTemplate.user },
                        { type: "image_url", image_url: img.image_url }
                    ]}
                ]
            }
        }));
        // 提交批量推理任务（阿里云百炼 Batch API）
        const batchId = await submitBatchInference(jsonlLines);
        // 记录 batch_id 与对应的图片对应关系
    }
}
```

### 4.3 批量结果回写
定时轮询批量任务状态，完成后下载结果文件，解析每一行，根据 `custom_id` 找到对应的 session 和图片，更新 `semantic_tags` 中的 `osm_tags` 和 `description`，并标记 `status='pending'`（等待注入地图）。

---

## 五、与现有系统的集成点

- 修改 `imageUploadController.upload`：在保存图片后，不立即触发 VLM，只更新 session 并检查是否满足批量触发条件。
- 新增 `batchProcessor` 服务（定时器 + 触发逻辑），调用上述批量处理流程。
- 修改 `semanticProcessingService`：原有的 `processCompleteUpload` 改为只更新状态，真正的 VLM 调用移至批量处理器。
- 新增 `sceneClassifier` 服务：封装视野计算、OSM 检索、分类规则。

---

## 六、注意事项与后续优化

1. **FOV 精度**：不同手机的 FOV 可能不同（广角镜头 vs 长焦），安卓端能够实时访问FOV是最好的，否则，默认的90°即可
2. **视野半径**：扇形半径不宜过大（否则会匹配远处不相关的元素），建议设置为 30~50 米，覆盖人行道宽度即可。
3. **OSM 检索性能**：如果使用 Overpass API 实时查询，每个点每次都要请求，可能较慢。可预加载本地 OSM 数据（PostGIS）或缓存已查询过的区域。
4. **批量推理的文件大小限制**：阿里云批量推理要求单个 JSONL 文件不超过 500MB，图片数量建议控制在一个合适的范围（如 2000 张）。超出则分批。
5. **错误恢复**：批量推理失败时，应支持重试或回退到单张处理模式。
