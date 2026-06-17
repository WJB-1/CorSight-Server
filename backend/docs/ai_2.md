好的，我们终于找到了根本原因：`frontendAvailable` 在启动时被判定为 `false`（可能是路径问题或文件尚未就绪），导致 SPA fallback 根本没注册。而且 `express.static` 对不存在的文件会直接返回 404 并终止请求链，即使 fallback 注册了也轮不到执行。

**解决方案**：不再依赖 `express.static` 处理前端，而是**完全手动控制**——在 fallback 中先检查请求是否对应 `dist` 目录下的实际静态文件（如 `.js`、`.css`），有则返回文件，否则返回预加载到内存的 `index.html`。同时，保留 `public` 和 `images` 的静态服务，并设置 `fallthrough: true` 以避免它们阻断后续处理。

---

### 修改后的 `server.js` 关键部分

```javascript
// ── 静态资源：public 和 images（fallthrough: true 不终止请求链） ──
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: true }));
app.use('/images', express.static(path.join(__dirname, '..', '..', 'shared', 'images'), { fallthrough: true }));

// ── 前端静态文件（dist 目录）——手动处理 ──
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
const indexHtmlPath = path.join(distPath, 'index.html');
let indexHtml = null;
if (require('fs').existsSync(indexHtmlPath)) {
    indexHtml = require('fs').readFileSync(indexHtmlPath, 'utf-8');
    console.log(`[Server] Frontend index.html loaded (${(indexHtml.length / 1024).toFixed(1)} KB)`);
} else {
    console.warn(`[Server] Frontend not found at ${distPath}`);
}

// ── 所有 API 路由（保持不变） ──
app.use('/api/upload', uploadRoutes);
// ... 其他路由

// ── 健康检查（保持不变） ──
app.get('/health', ...);

// ── SPA fallback（必须放在 API 路由之后） ──
app.get('*', (req, res, next) => {
    // 跳过 API 和 health
    if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
    }
    // 检查请求是否对应 dist 下的静态资源文件
    const filePath = path.join(distPath, req.path);
    if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
        return res.sendFile(filePath);
    }
    // 否则返回 index.html
    if (indexHtml) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(indexHtml);
    }
    // 若前端不存在，交给 404
    next();
});

// ── 最终 404 处理 ──
app.use((req, res) => {
    res.status(404).json({ success: false, message: '请求的资源不存在' });
});
```

---

### 现在执行以下步骤

1. **将更新后的 `server.js` 上传到服务器**（覆盖原文件）。
2. **重启 Node.js 服务**（确保加载新代码）。
3. **在服务器上测试**：
   ```cmd
   curl http://localhost:5741/
   ```
   应该返回完整的 HTML 页面源码（而不是 JSON 404）。

如果仍然有问题，请把服务器启动时的控制台输出（特别是前端加载日志）贴出来，我们进一步排查路径或文件权限问题。