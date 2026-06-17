好的，我们绕了一大圈，根本原因还是 `app.get('*')` 没有注册成功，因为 `frontendAvailable` 条件在服务器启动时被判定为 false（可能是路径问题或文件尚未就绪），导致 SPA fallback 一直不存在。现在我们直接无条件挂载 fallback，并把 index.html 预读到内存，这样就能保证任何非 API 的 GET 请求都能返回前端页面。

修改后的 server.js 核心部分如下：

```javascript
// 预加载前端 index.html（如果存在）
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
const indexPath = path.join(distPath, 'index.html');
let indexHtml = null;
if (require('fs').existsSync(indexPath)) {
    indexHtml = require('fs').readFileSync(indexPath, 'utf-8');
    console.log(`[Server] Frontend index.html loaded (${(indexHtml.length / 1024).toFixed(1)} KB)`);
} else {
    console.warn(`[Server] Frontend not found at ${indexPath}`);
}

// ... 所有 API 路由 ...

// SPA fallback：非 API、非静态资源的 GET 请求返回 index.html
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
    }
    if (indexHtml) {
        res.setHeader('Content-Type', 'text/html');
        return res.send(indexHtml);
    }
    next();
});

// 最终 404 处理
app.use((req, res) => {
    res.status(404).json({ success: false, message: '请求的资源不存在' });
});
```

> 注意：我们将 `app.use(express.static(...))` 放在 API 路由之前（但要先于 fallback），以便正常提供 JS/CSS 等静态资源。同时设置 `fallthrough: true` 确保未匹配的静态请求继续交给后面的中间件。

现在执行以下命令：

1. 将新的 `server.js` 上传到服务器并重启。
2. 在服务器上直接执行 `curl http://localhost:5741/` 验证是否能返回 HTML。

如果还有问题，请把服务器上的 `server.js` 完整内容贴出来，我们逐行排查。