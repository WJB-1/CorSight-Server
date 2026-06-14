# CorSight Frontend 架构文档

## 一、技术栈

| 技术 | 用途 |
|------|------|
| Vite 5 | 开发服务器 + 构建工具 + API 代理 |
| MapLibre GL JS 4.7 | 矢量地图引擎（WebGL 渲染） |
| 原生 JavaScript (ES Modules) | 无框架，模块化开发 |
| CSS3 | 暗色主题样式 |

**无第三方 UI 框架**（不用 React/Vue/Angular），保持轻量。

---

## 二、目录结构

```
frontend/
├── index.html              ← 入口 HTML，定义页面骨架和 DOM 结构
├── vite.config.js          ← Vite 配置（开发端口、API 代理）
├── package.json            ← 依赖声明
├── ARCHITECTURE.md         ← 本文件
│
└── src/
    ├── main.js             ← 主入口，初始化所有模块
    ├── api.js              ← API 客户端（fetch 封装）
    ├── map.js              ← 地图模块（MapLibre GL 初始化 + 图层管理）
    ├── panel.js            ← 左侧面板（采样点详情展示）
    ├── routePlanner.js     ← 路线规划模块（起终点选择 + SSE 进度）
    ├── console.js          ← 控制台模块（请求日志记录）
    └── style.css           ← 全局样式（暗色主题）
```

---

## 三、页面结构

两个 Tab 页面，通过顶部导航切换：

### 页面一：地图（默认）

```
┌─────────────────────────────────────────────────────────────┐
│  [CorSight]                    [地图]  [控制台]               │  ← 顶部导航栏
├─────────────────────────────────────────────────────────────┤
│ ┌───────────┐                                               │
│ │ 左侧面板   │              MapLibre 矢量地图                  │
│ │           │          （本地 guangzhou.mbtiles 瓦片）         │
│ │ 街景图片   │                                               │
│ │ 扇形蒙版   │                                               │
│ │ OSM 标签   │      ┌───────────────────┐                   │
│ │ VLM 结果   │      │ 路线规划            │                   │
│ │           │      │ 起点: 点击地图选择   │                   │
│ │           │      │ 终点: 点击地图选择   │                   │
│ └───────────┘      │ [✓] 行前预览       │                   │
│                    │ [✓] SSE 实时       │                   │
│                    │ 引擎: 高德 ▼        │                   │
│                    │ [ 开始规划 ]        │                   │
│                    └───────────────────┘                   │
│                                                        │
│  ┌─────────────────────────────────┐                    │
│  │ ═══ ● 路线规划完成：1.5公里...   │ ← SSE 进度条        │
│  └─────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**功能：**
- 矢量地图渲染（道路、建筑、水系、标注）
- 56 个采样点标注（彩色圆点区分状态）
- 点击采样点 → 左侧面板展示详情（街景图、标签、描述）
- 点击采样点图片上的扇形 → 地图上显示蓝色半透明扇形蒙版
- 右下角路线规划框：选起终点、选引擎、勾选预览/SSE
- SSE 模式下顶部显示实时进度条

### 页面二：控制台

```
┌─────────────────────────────────────────────────────────────┐
│  [CorSight]                    [地图]  [控制台]               │
├─────────────────────────────────────────────────────────────┤
│  实时日志                                          [清空]     │
├─────────────────────────────────────────────────────────────┤
│  13:25:01  GET   /api/navigation/points    200      12ms    │
│  13:25:05  POST  /api/navigation/route     200    3,200ms   │
│  13:25:08  GET   /api/tiles/tilejson        200       5ms   │
│  13:25:08  GET   /api/tiles/12/3339/1778    200    45,882B   │
│  13:25:10  GET   /api/sse/stream?reqId=...  200     长连接   │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

**功能：**
- 自动拦截全局 fetch 请求，记录方法/路径/状态码/耗时
- 颜色编码：GET 绿色、POST 橙色、DELETE 红色；2xx 绿色、4xx 橙色、5xx 红色
- 最多保留 500 行，自动滚动到底部
- 支持清空

---

## 四、各文件职责

### index.html — 入口页面

定义完整的 DOM 结构，不通过 JS 动态生成骨架。

```html
<nav id="topbar">        ← 顶部导航（Logo + 两个 Tab 链接）
<main id="app">          ← 页面容器
  <div id="page-map">    ← 地图页面
    <div id="map">       ← MapLibre 挂载点
    <div id="panel-left">← 左侧采样点详情面板
    <div id="route-box"> ← 右下角路线规划框
    <div id="sse-progress"> ← SSE 进度条
  <div id="page-console">← 控制台页面
    <div id="console-body">← 日志输出区
```

**外部资源加载：**
- MapLibre GL JS：`<script>` 标签从 unpkg CDN 加载
- MapLibre GL CSS：`<link>` 标签从 unpkg CDN 加载

---

### main.js — 主入口

**职责：** 初始化所有模块、加载采样点数据、页面切换逻辑。

```javascript
1. installFetchLogger()     ← 安装 fetch 拦截（console.js）
2. initConsole()            ← 初始化控制台
3. initMap('map', {...})    ← 初始化 MapLibre 地图
4. initPanel({...})         ← 初始化左侧面板
5. initRoutePlanner()       ← 初始化路线规划
6. loadPoints()             ← 从后端加载 56 个采样点 → 渲染到地图
```

**页面切换：** 监听导航链接的 `data-page` 属性，切换 `.page.active`。

---

### api.js — API 客户端

**职责：** 封装所有后端 API 调用。

```javascript
api.route(params)           ← POST /api/navigation/route
api.points()                ← GET  /api/navigation/points
api.tagStats()              ← GET  /api/data/tags/stats
api.sse(requestId)          ← new EventSource(/api/sse/stream?requestId=xxx)
```

支持 `window.API_BASE_URL` 全局变量覆盖后端地址（用于远程调试）。

---

### map.js — 地图模块

**职责：** MapLibre GL 初始化、矢量瓦片样式、采样点/扇形/路线的图层管理。

**地图数据源：**
```javascript
sources: {
  openmaptiles: { type: 'vector', url: '/api/tiles/tilejson' }  // 本地矢量瓦片
}
```

**图层管理（按 z-order 排列）：**

| 图层 | 类型 | 数据源 | 说明 |
|------|------|--------|------|
| `background` | fill | 无 | 深蓝背景色 |
| `water` | fill | openmaptiles/water | 水系（深蓝） |
| `building` | fill | openmaptiles/building | 建筑（半透明深色） |
| `landuse` | fill | openmaptiles/landuse | 土地利用 |
| `road-secondary` | line | openmaptiles/transportation | 次级道路 |
| `road-primary` | line | openmaptiles/transportation | 主干道（更粗） |
| `road-path` | line | openmaptiles/transportation | 人行道（虚线） |
| `road-label` | symbol | openmaptiles/transportation_name | 道路名称 |
| `poi-label` | symbol | openmaptiles/poi | POI 标注 |
| `route-line` | line | GeoJSON | 规划路线（青色） |
| `sector-fill` | fill | GeoJSON | 扇形蒙版（蓝色半透明） |
| `sector-outline` | line | GeoJSON | 扇形边框 |
| `points-circle` | circle | GeoJSON | 采样点（彩色圆点） |
| `markers-symbol` | symbol | GeoJSON | 起终点标记 |

**导出函数：**

| 函数 | 说明 |
|------|------|
| `initMap(container, opts)` | 初始化地图，注册点击回调 |
| `renderPoints(points)` | 渲染采样点到地图 |
| `renderSectors(pointId, images)` | 绘制某个点的扇形覆盖 |
| `clearSectors()` | 清除扇形 |
| `renderRoute(coords, origin, dest)` | 绘制路线 + 起终点标记 |
| `clearRoute()` | 清除路线 |

**暗色主题样式（OpenMapTiles）：**
- 背景：`#1a1a2e`（深蓝黑）
- 水系：`#0f3460`（深蓝）
- 建筑：`#16213e`（深灰蓝，70% 不透明）
- 主干道：`#4a5568`（灰色）
- 次级道路：`#2d3748`（深灰）
- 标注文字：`#8899aa`（浅灰蓝）

---

### panel.js — 左侧面板

**职责：** 采样点详情展示（街景图、标签、描述、扇形触发）。

**布局：**

```
┌─────────────────────────┐
│ 采样点详情         [×]   │  ← 标题 + 关闭按钮
├─────────────────────────┤
│ 街景图片                 │
│ ┌─────┐ ┌─────┐        │
│ │ 北0° │ │ 东北45°│        │  ← 2 列网格，8 张图
│ └─────┘ └─────┘        │
│ ┌─────┐ ┌─────┐        │
│ │ 东90°│ │ 东南135°│       │
│ └─────┘ └─────┘        │
│ ...                     │
│                         │
│ OSM 标签（合并）          │
│ ┌──────────────────┐   │
│ │ tactile_paving=yes│   │  ← 蓝色药丸标签
│ │ surface=asphalt   │   │
│ │ lit=yes           │   │
│ └──────────────────┘   │
│                         │
│ 语义描述                 │
│ ┌──────────────────┐   │
│ │ 位于人行横道旁...  │   │  ← 合并描述文本
│ └──────────────────┘   │
│                         │
│ VLM 分析结果（逐图）     │
│ 北 0° · crossing        │
│ ┌──────────────────┐   │
│ │ crossing=signals  │   │  ← 每张图的独立标签
│ │ tactile=yes       │   │
│ │ "有声信号灯人行横道"│   │
│ └──────────────────┘   │
│                         │
│ 状态: pending           │
└─────────────────────────┘
```

**交互：**
- 点击图片 → 全屏弹窗预览（`modal-overlay`）
- 打开面板 → 同时在地图上绘制该点的扇形覆盖（蓝色半透明）
- 关闭面板 → 清除扇形

---

### routePlanner.js — 路线规划

**职责：** 起终点选择、路线请求、SSE 进度监听。

**交互流程：**

```
1. 点击"起点"文字 → pickingMode = 'origin'
2. 点击地图 → 设置起点坐标
3. 点击"终点"文字 → pickingMode = 'dest'
4. 点击地图 → 设置终点坐标
5. 点击"开始规划" → 发起请求
```

**两种请求模式：**

| 模式 | 条件 | 流程 |
|------|------|------|
| 同步 | `enable_sse=false` | POST → 等待完整响应 → 渲染结果 |
| SSE | `enable_sse=true && enable_preview=true` | POST 拿 requestId → EventSource 监听 → 逐步更新进度条 → done 事件渲染最终结果 |

**SSE 进度事件流：**
```
connected → route → route_done → sample → sample_done → rag → rag_done → broadcast → broadcast_done → done → close
```

---

### console.js — 控制台模块

**职责：** 记录并展示所有 HTTP 请求日志。

**实现原理：**
```javascript
// 拦截全局 fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const start = Date.now();
  const res = await originalFetch.apply(this, args);
  const duration = Date.now() - start;
  addLog({ method, path, status, duration });  // 记录到控制台
  return res;
};
```

**导出函数：**

| 函数 | 说明 |
|------|------|
| `initConsole()` | 初始化（绑定清空按钮） |
| `installFetchLogger()` | 安装 fetch 拦截器 |
| `addLog(entry)` | 添加一行格式化日志 |
| `addTextLog(text, type)` | 添加纯文本日志（info/warn/error/success） |

---

### style.css — 全局样式

**主题：** 深色科技风（暗蓝背景 + 青色高亮）

**色彩体系：**

| 色值 | 用途 |
|------|------|
| `#1a1a2e` | 页面背景 |
| `#16213e` | 面板/卡片背景 |
| `#0f3460` | 边框/分割线 |
| `#00d2ff` | 主题色（青色高亮） |
| `#e0e0e0` | 主文字 |
| `#8899aa` | 次要文字 |
| `#3fb950` | 成功/GET |
| `#f0883e` | 警告/POST |
| `#f85149` | 错误/DELETE |

---

## 五、数据流

### 1. 页面加载

```
main.js
  → api.points() → GET /api/navigation/points
    → 后端查 MongoDB semantic_tags
  → map.renderPoints(points)
    → MapLibre 渲染 56 个圆点到地图
```

### 2. 点击采样点

```
map.js (click 事件)
  → panel.openPanel(pointData)
    → 渲染街景图片网格
    → 渲染合并标签
    → 渲染 VLM 分析结果
  → map.renderSectors(pointId, images)
    → 地图上画蓝色扇形蒙版
```

### 3. 路线规划（同步模式）

```
routePlanner.js
  → api.route({origin, destination, engine, enable_preview})
    → POST /api/navigation/route
      → 后端: 高德算路线 → RAG 检索 → LLM 生成播报
  ← { route: {...}, preview: {broadcast, ...} }
  → 渲染路线到地图 + 显示播报文本
```

### 4. 路线规划（SSE 模式）

```
routePlanner.js
  → api.route({..., enable_sse: true})
    → POST /api/navigation/route
  ← { request_id, sse_url }
  → api.sse(requestId)
    → GET /api/sse/stream?requestId=xxx（长连接）
  ← progress: "路线规划完成..."
  ← progress: "路况检索完成..."
  ← progress: "播报生成完毕"
  ← done: { route, preview }
  → 渲染路线 + 显示播报
  ← close（连接关闭）
```

### 5. 矢量瓦片加载

```
MapLibre GL（自动）
  → GET /api/tiles/tilejson
    → 后端从 guangzhou.mbtiles 读元数据
  → GET /api/tiles/{z}/{x}/{y}.pbf（按需加载当前视野内的瓦片）
    → 后端从 guangzhou.mbtiles 读瓦片二进制数据
  → 浏览器解码 protobuf → WebGL 渲染矢量图形
```

---

## 六、Vite 配置

```javascript
// vite.config.js
server: {
  port: 5173,
  proxy: {
    '/api': 'http://localhost:5741',    // API 请求代理到后端
    '/images': 'http://localhost:5741', // 图片请求代理到后端
  }
}
```

开发时前端 `localhost:5173`，后端 `localhost:5741`，Vite 自动代理 `/api` 请求。

---

## 七、构建与部署

```bash
# 开发
cd frontend && npm run dev        # 启动 Vite 开发服务器

# 生产构建
cd frontend && npm run build      # 输出到 dist/ 目录

# 生产部署
# dist/ 目录可直接用 nginx 托管，反向代理 /api 到后端
```
