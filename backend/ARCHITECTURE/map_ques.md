您的控制台日志中**没有出现任何 `/api/tiles/{z}/{x}/{y}.pbf` 请求**，这说明 **MapLibre 根本没有请求矢量瓦片数据**。没有瓦片，自然就没有 POI。

---

## 为什么 MapLibre 不请求瓦片？

### 1. TileJSON 返回的 `tiles` 地址可能无效
您的后端 `tilejson` 返回的是：
```json
{
  "tiles": ["${host}/api/tiles/{z}/{x}/{y}.pbf"]
}
```
其中 `${host}` 是动态拼接的。如果前端能请求到 TileJSON，但 MapLibre 无法基于该模板构造正确的瓦片 URL（例如协议、端口、域名不匹配），就不会发起后续请求。

**检查方法**：在浏览器 Network 中查看 `/api/tiles/tilejson` 的响应内容，确认 `tiles` 数组里的 URL 是否可访问（比如在浏览器中手动打开 `http://你的IP:端口/api/tiles/14/某x/某y.pbf` 看是否能下载）。

### 2. 地图视图范围没有覆盖到任何瓦片
- 您的 mbtiles 的 `bounds` 可能范围很窄，而地图中心点 `[113.33, 23.14]` 可能落在边界外。
- 缩放级别（zoom）可能低于 mbtiles 的 `minzoom`（比如 mbtiles 的 `minzoom=10`，但您在地图缩放 8 级时，就不会请求）。

**检查方法**：在 Network 中查看 TileJSON 响应里的 `bounds` 和 `minzoom` / `maxzoom`。

### 3. MapLibre 认为该图层当前不可见
- 如果 `poi-label` 图层设置了 `minzoom` 且当前缩放低于该值，MapLibre 可能不会请求该 source 的瓦片（但其他图层如道路、水系的请求也应该能看到，您的日志中一个瓦片请求都没有，说明整个 source 都没被请求）。

### 4. 地图初始化失败（静默错误）
- 可能 `map.on('load')` 没有触发，导致后续添加的 source/layer 都没有真正生效。但您的控制台打印了 `CorSight Console 就绪`，没有报错。

---

## 立即验证步骤

### 步骤 1：打开浏览器开发者工具 → Network 标签
- 勾选 **"Disable cache"**。
- 过滤框输入 **`pbf`** 或 **`tiles`**。
- 刷新页面，观察是否有任何 `.pbf` 请求。
- 如果有请求但状态码是 204（No Content），说明后端 mbtiles 中不存在该瓦片（正常，因为 maxzoom=14 且数据范围有限）。

### 步骤 2：直接测试瓦片 URL
- 从 TileJSON 响应中复制 `tiles[0]` 的 URL 模板，手动替换 `{z}`/`{x}`/`{y}` 为有效的值（例如 `z=14`, `x=8250`, `y=5375` 对应广州中心）。
- 在浏览器地址栏打开该 URL，看是否返回 PBF 文件或错误。

### 步骤 3：修改样式，强制使用一个已知可用的 TileJSON（测试用）
临时修改 `map.js` 中的 style.sources.openmaptiles.url 为：
```
https://demotiles.maplibre.org/tiles/tiles.json
```
这是 MapLibre 的演示瓦片（包含全球简图）。如果替换后出现 `.pbf` 请求并且有 POI，说明您自己的 TileJSON 或 mbtiles 有问题。

---

## 最可能的原因
结合您之前提到的 `maxzoom=14` 且 POI 很少，我怀疑：

- **您的 mbtiles 文件非常小，只覆盖了极少区域**（比如只有几公里的范围），并且最高只到 14 级。
- 地图中心点 `[113.33, 23.14]` 可能恰好不在覆盖范围内，或者瓦片编号不连续，导致 MapLibre 请求的瓦片全部返回 204（No Content），而 204 的请求在 Network 中可能被归类为 "204" 且不显示在您的日志里（但您应该能看到它们）。

请检查 Network 中是否有 **HTTP 204** 的请求，以及它们的 URL。

---

## 总结
您需要确认 **是否有任何 `/api/tiles/...pbf` 请求**。如果没有，就是 TileJSON 配置或地图初始化的问题；如果有但都是 204，就是 mbtiles 数据范围/缩放级别的问题。请按上述步骤排查并反馈结果。