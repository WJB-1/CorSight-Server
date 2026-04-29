# 高德地图 API 使用说明

本文档说明 navigation_agent 前端项目中高德地图 API 的使用方式。

## 一、使用的高德服务

### 1. 高德地图 JSAPI 2.0
- **服务类型**: 高德地图 JavaScript API
- **版本**: 2.0
- **Key**: `6e760d76e5650f0f9004c5412dcfc58e`
- **安全密钥**: `3bbda8110ca478853e8500df55ee9a7d`
- **用途**: 地图显示、交互、标记点展示

### 2. 使用的插件
| 插件名 | 用途 |
|--------|------|
| `AMap.Scale` | 地图比例尺控件 |
| `AMap.ToolBar` | 地图工具条控件（缩放、平移） |

### 3. 使用的 API 功能
- **地图基础**: 地图初始化、中心点设置、缩放控制
- **标记点**: `AMap.Marker` - 显示采样点标记
- **事件绑定**: 地图移动、点击、右键菜单事件
- **控件**: 比例尺、工具条

---

## 二、加载方式（已解决 ✅）

### 当前方式：JSAPI Loader + 安全密钥（推荐）

```html
<!-- index.html -->
<script type="text/javascript">
  // 步骤 1: 配置安全密钥（必须在 Loader 之前）
  window._AMapSecurityConfig = {
    securityJsCode: '3bbda8110ca478853e8500df55ee9a7d'
  }
</script>

<!-- 步骤 2: 加载 JSAPI Loader -->
<script src="https://webapi.amap.com/loader.js"></script>
```

**状态**: ✅ 已验证可用（2024-03-24）

### 加载流程

```
1. 配置安全密钥 (_AMapSecurityConfig)
        ↓
2. 加载 Loader (loader.js)
        ↓
3. 调用 AMapLoader.load() 加载 API (mapLoader.js)
        ↓
4. 创建地图实例 (MapViewer.js)
        ↓
5. 添加控件和事件绑定
```

---

## 三、代码架构

### 1. 入口文件
- **文件**: [`index.html`](index.html:1)
- **作用**: 
  - 配置安全密钥
  - 加载 JSAPI Loader

### 2. 地图加载服务
- **文件**: [`src/services/mapLoader.js`](src/services/mapLoader.js:1)
- **作用**: 统一封装高德地图加载逻辑
- **导出函数**:
  - `loadAMap()` - 加载高德地图
  - `waitForAMap(timeout)` - 等待高德地图加载完成
  - `getAMap()` - 获取已加载的 AMap 实例
  - `isAMapLoaded()` - 检查是否已加载

### 3. 地图组件
- **文件**: [`src/components/MapViewer.js`](src/components/MapViewer.js:1)
- **作用**: 封装地图初始化、交互逻辑
- **核心方法**:
  - `init()` - 初始化地图（使用 mapLoader 等待 AMap）
  - `createMap(AMap)` - 创建地图实例
  - `addControls(AMap)` - 添加控件
  - `bindEvents()` - 绑定地图事件
  - `addPointMarker()` - 添加采样点标记
  - `setOrigin()` - 设置起点标记
  - `setDestination()` - 设置终点标记

### 4. 主入口
- **文件**: [`src/main.js`](src/main.js:1)
- **作用**: 初始化应用
- **流程**:
  1. 等待高德地图加载 (`waitForAMap`)
  2. 检查后端健康状态
  3. 初始化配置面板
  4. 初始化地图组件

---

## 四、配置信息

### 当前 Key 配置
```
Key: 6e760d76e5650f0f9004c5412dcfc58e
安全密钥: 3bbda8110ca478853e8500df55ee9a7d
版本: 2.0
状态: ✅ 已验证可用
```

### 高德控制台配置要求
访问 https://console.amap.com/dev/key/app

已配置项：
- ✅ **启用 JSAPI** 功能
- ✅ **安全密钥** (securityJsCode)
- ✅ **域名白名单**: `localhost`, `127.0.0.1`

---

## 五、问题记录

### 已解决的问题

**问题描述**: Vite 项目中地图实例创建成功但显示黑屏，无法加载瓦片。

**根本原因**: 
- Vite 使用 ES Module，JSAPI Loader 加载是异步的
- MapViewer 初始化时 AMap 可能还未加载完成

**解决方案**:
1. 创建 `mapLoader.js` 服务统一封装加载逻辑
2. 使用单例模式确保 AMap 只加载一次
3. 添加 `waitForAMap()` 函数等待加载完成
4. 在 `main.js` 和 `MapViewer.js` 中使用等待机制

---

## 六、调试脚本

位于 `test/debug/` 目录：

| 脚本 | 用途 |
|------|------|
| `step1-basic-amap.html` | 基础加载测试 |
| `step5-key-config.html` | Key 配置检查 |
| `step7-canvas-inspect.html` | Canvas 渲染检查 |
| `step8-jsapi-loader.html` | Loader 方案测试 |
| `step11-solution-test.html` | **最终解决方案验证** |

---

## 七、使用示例

```javascript
// main.js - 等待高德地图加载
import { waitForAMap } from './services/mapLoader.js';

async function initApp() {
  // 等待高德地图加载完成
  await waitForAMap(30000);
  
  // 初始化地图组件
  const mapViewer = new MapViewer('map-viewer');
}

// MapViewer.js - 在组件内等待
import { waitForAMap } from '../services/mapLoader.js';

async init() {
  const AMap = await waitForAMap(30000);
  // 使用 AMap 创建地图...
}
```

---

## 八、相关链接

- [高德地图 JSAPI 文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)
- [高德控制台](https://console.amap.com/dev/key/app)
- [JSAPI Loader 文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load loader)

---

**最后更新**: 2024-03-24  
**问题状态**: ✅ 已解决
