# 高德地图调试步骤

这个目录包含逐步调试高德地图加载问题的测试页面。

## 问题现象

- ✅ 地图实例创建成功
- ✅ AMap 对象加载正常
- ❌ **地图瓦片不显示（空白）**

## 根本原因

经过 Step 6 深度检查发现：**Canvas 元素数量为 0**，说明高德地图未能初始化渲染层。

## 调试步骤（按顺序执行）

### Step 1: 基础加载测试
打开 `step1-basic-amap.html`
- 检查 AMap 是否正确加载
- 测试最基本的地图创建
- 如果这步失败，说明 Key 或网络有问题

### Step 2: 插件加载测试
打开 `step2-with-plugins.html`
- 测试 AMap.plugin() 加载插件
- 测试控件添加
- 如果这步失败，说明插件加载有问题

### Step 3: Vite 环境模拟
打开 `step3-vite-simulation.html`
- 模拟真实的 Vite 项目环境
- 测试 ES Module + flex 布局
- 如果这步失败，说明布局或初始化顺序有问题

### Step 4: 瓦片加载调试
打开 `step4-tile-debug.html`
- 检查 DOM 中的瓦片图片元素
- 监控网络请求和图片加载错误
- 检测安全密钥配置问题

### Step 5: Key 配置与安全密钥
打开 `step5-key-config.html`
- 检查安全密钥（securityJsCode）配置
- 提供一键修复工具
- 显示详细解决步骤

### Step 6: 瓦片深度检查 ⭐ 关键
打开 `step6-tile-deep-inspect.html`
- **检查 Canvas 元素数量**
- 分析容器内部 DOM 结构
- 区分 img 瓦片和 canvas 渲染

**关键发现**：如果显示 `Canvas 数量: 0`，说明地图渲染层未初始化

### Step 7: Canvas 渲染检查
打开 `step7-canvas-inspect.html`
- 检查 WebGL 支持
- 分析 Canvas 尺寸和内容
- 强制触发重绘

### Step 8: JSAPI Loader 解决方案 ⭐ 推荐
打开 `step8-jsapi-loader.html`
- 使用官方 JSAPI Loader 加载
- **这是解决 Canvas 渲染问题的推荐方案**
- 提供应用到项目的代码

## 诊断流程

```
Step 1 (基础) → Step 2 (插件) → Step 3 (环境)
                    ↓
            都通过但地图不显示
                    ↓
            Step 6 (深度检查)
                    ↓
        Canvas = 0? → 是 → 使用 Step 8 (Loader 方案)
                    ↓
        Canvas > 0? → 是 → 检查样式/层级问题
```

## 最终解决方案

### 方案 A：使用 JSAPI Loader（推荐）

修改 `index.html`：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>视障语义地图导航预览</title>
  
  <!-- 使用 JSAPI Loader -->
  <script src="https://webapi.amap.com/loader.js"></script>
  
  <link rel="stylesheet" href="./src/style.css">
</head>
<body>
  <div id="app">
    <!-- ... 原有内容 ... -->
    <section class="map-container">
      <div id="map-viewer"></div>
    </section>
  </div>

  <script type="module">
    // 使用 Loader 加载地图
    const AMap = await AMapLoader.load({
      key: "0beb99f14b04f13a734c81c032b9a8f1",
      version: "2.0",
      plugins: ['AMap.Scale', 'AMap.ToolBar']
    });
    
    // 创建地图
    const map = new AMap.Map('map-viewer', {
      zoom: 15,
      center: [116.397428, 39.90923],
      viewMode: '2D'
    });
    
    // 添加控件
    map.addControl(new AMap.Scale());
    map.addControl(new AMap.ToolBar({ position: 'RB' }));
    
    // 保存到全局
    window.appMap = map;
    
    // 继续初始化其他组件...
  </script>
</body>
</html>
```

### 方案 B：检查高德控制台配置

1. 访问 https://console.amap.com/dev/key/app
2. 确认 Key 已启用 **JSAPI** 功能
3. 添加域名白名单：`localhost`、`127.0.0.1`
4. 如需安全密钥，在代码中添加：

```javascript
window._AMapSecurityConfig = {
  securityJsCode: '您的安全密钥'
};
```

## 常见问题

### Q: 为什么直接用 `<script src>` 加载不行？
A: 高德 2.0 对加载顺序和初始化有严格要求，JSAPI Loader 能确保正确的加载顺序和依赖管理。

### Q: Canvas 数量为 0 是什么意思？
A: 高德 2.0 使用 Canvas 或 WebGL 渲染瓦片。如果 Canvas 为 0，说明渲染引擎未初始化，可能是：
- 加载方式不正确
- Key 权限问题
- 浏览器兼容性问题

### Q: 如何确认是前端问题还是 Key 问题？
A: 运行 Step 8，如果使用 Loader 方式 Canvas > 0，则是加载方式问题；如果 Canvas 仍为 0，则是 Key 配置问题。

## 错误代码速查

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| USERKEY_PLAT_NOMATCH | Key 与平台不匹配 | 检查 Key 是否配置了 Web 服务 |
| USERKEY_NOT_FOUND | Key 不存在 | 检查 Key 是否正确复制 |
| INVALID_USER_KEY | Key 无效 | 检查 Key 是否被禁用或过期 |
| Canvas = 0 | 渲染层未初始化 | 使用 JSAPI Loader |
| 无错误但空白 | 多种可能 | 按诊断流程检查 |

## 使用方法

1. 直接用浏览器打开 HTML 文件（不需要服务器）
2. 按 F12 打开控制台查看详细日志
3. 按顺序执行 Step 1 → Step 8 进行诊断
4. 根据 Step 6 的结果选择解决方案
