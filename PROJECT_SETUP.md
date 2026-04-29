# CorSight Navigation 项目启动指南

## 端口配置说明

本项目包含三个服务，使用不同端口避免冲突：

| 服务 | 端口 | 说明 |
|------|------|------|
| Blind_map 后端 | **3001** | 提供街景图片服务 |
| navigation_agent 前端 | **3000** | Vite 开发服务器 |
| navigation_agent 后端 | **3002** | API 服务 |

## 启动步骤

### 1. 启动 Blind_map 后端（必须）

```bash
cd Blind_map/backend
npm start
```

确认看到：`监听端口: 3001`

### 2. 启动 navigation_agent 后端

```bash
cd navigation_agent/backend
npm start
```

确认看到：`Server is running on port 3002`

### 3. 启动 navigation_agent 前端

```bash
cd navigation_agent/frontend
npm run dev
```

确认看到：`Local: http://localhost:3000/`

## 验证街景功能

1. 访问 http://localhost:3000
2. 在地图上点击任意位置
3. 如果附近有街景采样点，会显示蓝色标记
4. 点击蓝色标记打开街景预览
5. 点击方向按钮切换 8 个方向的街景图片

## 调试工具

调试脚本位于 `navigation_agent/test/phase2-debug/`：

- `index.html` - Phase 2 街景调试主页面
- `backend-test.html` - 后端连接测试
- `network-debug.html` - 网络诊断工具

## 常见问题

### 街景图片不显示

1. 检查 Blind_map 后端是否在 3001 端口运行
2. 浏览器直接访问：http://localhost:3001/images/P001_N.jpg
3. 如果看不到图片，检查 Blind_map/backend/public/images/ 目录是否存在

### 采样点不显示

1. 检查 navigation_agent 后端是否启动
2. 检查 MongoDB 是否连接成功
3. 确认数据库中有采样点数据

### 端口冲突

如果提示端口被占用：
- 3000 端口: 检查是否有其他 Vite/Node 进程
- 3001 端口: Blind_map 后端专用，不可更改
- 3002 端口: navigation_agent 后端专用
