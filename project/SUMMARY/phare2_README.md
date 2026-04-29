# Phase 2 前端地图交互模块 - 阶段总结

## 📋 阶段概述

**Phase 2** 完成了导航预览 Agent 的前端可视化与交互模块开发，实现了视障语义地图导航预览的完整前端交互界面。

### 核心目标
- ✅ 搭建前端基础脚手架与 LLM 配置面板
- ✅ 集成高德地图底座并实现渲染
- ✅ 实现视障语义 POI 渲染与街景交互
- ✅ 完成导航选点逻辑与状态暂存

---

## 🏗️ 工程架构

```
frontend/                              # 【Phase 2】前端可视化与交互模块
├── index.html                         # 主页面入口，引入高德地图 SDK
├── package.json                       # 依赖管理 (Vite)
├── vite.config.js                     # Vite 配置与代理
├── README.md                          # 本文档
└── src/
    ├── main.js                        # 前端主逻辑挂载点
    ├── style.css                      # 全局样式与地图容器样式
    ├── components/
    │   ├── MapViewer.js               # 地图渲染、选点交互、绘制 POI
    │   ├── ConfigPanel.js             # LLM API Key 配置表单组件
    │   └── StreetViewModal.js         # 8 方位街景图像弹窗组件
    └── services/
        └── api.js                     # 封装 HTTP 请求，对接后端 3002 端口
```

### 跨模块接口协议

| 数据流 | 源 | 目标 | 接口 | 说明 |
|--------|-----|------|------|------|
| 鉴权配置 | ConfigPanel.js | Backend | `POST /api/config/llm` | 提交 LLM 配置 |
| 配置状态 | Backend | ConfigPanel.js | `GET /api/config/llm/active` | 获取当前激活配置 |
| 空间数据 | Backend | MapViewer.js | `GET /api/navigation/nearby` | 获取附近采样点 |
| 街景数据 | MapViewer.js | StreetViewModal.js | `images` 字典 | 8方位图片数据 |

---

## 📦 模块实现详情

### 模块 2.1：前端工程初始化与 LLM 配置面板

**实现文件：**
- [`src/services/api.js`](src/services/api.js) - API 请求封装
- [`src/components/ConfigPanel.js`](src/components/ConfigPanel.js) - 配置面板组件

**功能特性：**
- 提供商选择：Google Gemini / OpenAI / Anthropic / Azure
- 模型选择：根据提供商动态加载可用模型列表
- API Key 输入：安全密码输入框
- 状态回显：页面加载时自动获取当前激活配置

**接口协议：**
```javascript
// 获取当前激活配置
GET /api/config/llm/active

// 保存配置
POST /api/config/llm
{
  "provider": "google",
  "apiKey": "xxx",
  "modelName": "gemini-pro",
  "isActive": true
}
```

---

### 模块 2.2：高德地图底座加载与容器渲染

**实现文件：**
- [`index.html`](index.html) - 高德地图 SDK 引入
- [`src/components/MapViewer.js`](src/components/MapViewer.js) - 地图初始化
- [`src/style.css`](src/style.css) - 地图容器样式

**技术要点：**
- 使用高德地图 JS API 2.0
- 引入插件：`AMap.Scale`, `AMap.ToolBar`, `AMap.Walking`
- 初始中心点：北京 (116.397428, 39.90923)
- 地图填满主视觉区域，支持拖拽平移和滚轮缩放

**SDK 引入：**
```html
<script src="https://webapi.amap.com/maps?v=2.0&key=YOUR_AMAP_KEY&plugin=AMap.Scale,AMap.ToolBar,AMap.Walking"></script>
```

---

### 模块 2.3：视障语义 POI 渲染与街景交互

**实现文件：**
- [`src/components/MapViewer.js`](src/components/MapViewer.js) - POI 渲染逻辑
- [`src/components/StreetViewModal.js`](src/components/StreetViewModal.js) - 街景弹窗

**数据流：**
1. 监听地图 `moveend` 事件
2. 获取当前中心点坐标
3. 调用 `GET /api/navigation/nearby?lat={lat}&lon={lon}&radius=1000`
4. 使用蓝色自定义 Marker 渲染采样点
5. 点击 Marker 弹出街景模态框

**街景弹窗内容：**
- 场景描述 (`scene_description`)
- 8 方位图片展示 (N, NE, E, SE, S, SW, W, NW)
- 九宫格或轮播图形式展示
- 点位 ID、坐标、距离信息

---

### 模块 2.4：导航选点逻辑与状态暂存

**实现文件：**
- [`src/components/MapViewer.js`](src/components/MapViewer.js) - 右键菜单与选点
- [`src/main.js`](src/main.js) - 全局状态管理

**交互协议：**
- 右键菜单："设为起点" / "设为终点" / "清除"
- 起点标记：绿色图标
- 终点标记：红色图标
- 全局状态维护在 `window.appState`

**全局状态结构：**
```javascript
window.appState = {
  origin: { lng: 116.397, lat: 39.909 },      // 起点坐标
  destination: { lng: 116.398, lat: 39.910 },  // 终点坐标
  map: AMap.Map,                               // 地图实例
  mapViewer: MapViewer                         // 地图查看器实例
}
```

**生成推演按钮：**
- 位置：左侧面板
- 状态：起终点均未设置时禁用，均设置后启用
- 功能：输出坐标日志，为 Phase 3/4 准备

---

## ✅ Phase 2 验收标准检查清单

### 1. 地图底座无错渲染 (模块 2.2)

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Bug 修复确认 | ✅ | `AMap.Scale is not a constructor` 报错已修复 |
| 地图呈现 | ✅ | 地图铺满容器，支持拖拽平移和滚轮缩放 |

**修复内容：**
- 补全 `index.html` 中的插件参数：`plugin=AMap.Scale,AMap.ToolBar,AMap.Walking`

---

### 2. LLM 配置链路闭环 (模块 2.1)

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 状态回显 | ✅ | 页面刷新时自动请求 `GET /api/config/llm/active` |
| 保存联调 | ✅ | 点击保存后调用 `POST /api/config/llm`，状态立即更新 |

---

### 3. 视障语义 POI 与街景交互 (模块 2.3)

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 动态加载 | ✅ | `moveend` 事件触发 `GET /api/navigation/nearby` 请求 |
| 视觉标记 | ✅ | 蓝色标记渲染采样点，区别于普通 POI |
| 街景弹窗 | ✅ | 点击标记弹出 StreetViewModal，展示描述和 8 方位图片 |

---

### 4. 导航推演的战前准备 (模块 2.4)

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 起终点选取 | ✅ | 右键菜单成功设置起点(绿)和终点(红) |
| 全局状态更新 | ✅ | `window.appState.origin/destination` 正确赋值 |
| 核心按钮联动 | ✅ | "生成推演播报"按钮在起终点均设置后启用 |

---

## 🚀 安装与运行

### 环境要求
- Node.js >= 16
- 后端服务运行在 `http://localhost:3002`

### 安装步骤

```bash
cd frontend
npm install
```

### 开发运行

```bash
npm run dev
```

前端服务运行在 `http://localhost:3000`，通过 Vite 代理访问后端。

### 生产构建

```bash
npm run build
```

---

## ⚙️ 配置说明

### 高德地图 Key

编辑 [`index.html`](index.html)，替换 `YOUR_AMAP_KEY`：

```html
<script src="https://webapi.amap.com/maps?v=2.0&key=YOUR_AMAP_KEY&plugin=AMap.Scale,AMap.ToolBar,AMap.Walking"></script>
```

获取 Key：https://lbs.amap.com/

### 后端地址

默认后端地址：`http://localhost:3002`

如需修改，编辑 [`src/services/api.js`](src/services/api.js)：

```javascript
const BASE_URL = 'http://localhost:3002'
```

---

## 📡 API 接口列表

### LLM 配置接口

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/config/llm/active` | 获取当前激活的 LLM 配置 |
| POST | `/api/config/llm` | 保存 LLM 配置 |
| GET | `/api/config/models` | 获取可用模型列表 |

### 导航接口

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/navigation/nearby` | 获取附近采样点 |
| GET | `/health` | 健康检查 |

---

## 🎨 样式说明

- CSS 变量定义在 `:root` 中，便于主题定制
- 地图标记使用自定义 DOM 实现
- 响应式设计：侧边栏在移动端自动调整宽度
- 地图容器高度自适应视口

---

## 📝 注意事项

1. **端口冲突**：确保 3000 和 3002 端口未被占用
2. **跨域问题**：开发环境通过 Vite 代理解决，生产环境需配置 CORS
3. **高德 Key**：生产环境需要申请正式 Key
4. **后端依赖**：前端功能依赖后端服务正常运行
5. **图片路径**：后端返回的图片路径需要可访问

---

## 🔮 后续阶段预览

### Phase 3 (规划中)
- 路径规划与沙盘推演
- 整合 Walking 插件进行路径计算

### Phase 4 (规划中)
- Agent 逻辑与高阶推理
- 多模态输入处理

### Phase 5 (规划中)
- 推演播报与 TTS
- PreviewPlayer 组件实现

---

## 📄 文档关联

- [Phase 2 开发指导文档](../project/phase%202开发指导文档.md) - 详细开发规范
- [模块二验收标准](../project/模块二验收标准.md) - 验收检查清单
- [Phase 1 开发指导文档](../project/phase%201开发指导文档.md) - 后端开发规范
- [后端 README](../backend/README.md) - 后端服务文档

---

## 🏁 阶段结论

**Phase 2 前端地图交互模块已按验收标准全部完成。**

核心成果：
- ✅ 前端工程架构清晰，模块职责分明
- ✅ 与 Phase 1 后端服务完成联调
- ✅ 地图底座稳定运行，无关键报错
- ✅ 视障语义 POI 可视化与街景交互流畅
- ✅ 导航选点逻辑完善，全局状态管理就绪

为 Phase 3/4/5 的高级 Agent 功能奠定了坚实的交互基础。
