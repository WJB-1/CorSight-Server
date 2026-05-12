# Blind_map 后端端口变更说明

## 问题原因
navigation_agent 前端 (Vite) 占用了端口 3000，与 Blind_map 后端冲突。

## 解决方案
将 Blind_map 后端端口从 3000 改为 3001

## 变更的文件

1. **Blind_map/backend/app.js** - 后端端口改为 3001
2. **navigation_agent/test/phase2-debug/points-data.js** - 图片URL改为 3001
3. **navigation_agent/test/phase2-debug/index.html** - 注释和日志改为 3001

## 操作步骤

1. **停止 Blind_map 后端** (如果正在运行)
   ```
   Ctrl+C
   ```

2. **重新启动 Blind_map 后端**
   ```bash
   cd Blind_map/backend
   npm start
   ```
   应该看到: `监听端口: 3001`

3. **验证端口**
   - navigation_agent 前端: http://localhost:3000
   - Blind_map 后端: http://localhost:3001/health

4. **测试图片访问**
   浏览器访问: http://localhost:3001/images/P001_N.jpg

5. **打开调试页面**
   navigation_agent/test/phase2-debug/index.html
   点击"导入并显示采样点"测试
