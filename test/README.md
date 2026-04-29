# Phase 1 测试说明

## 文件结构

```
backend/
├── .env                          # 环境变量配置
├── package.json                  # 项目依赖
├── server.js                     # Express 服务器入口
├── config/
│   ├── db.js                     # MongoDB 连接配置
│   └── llmConfig.js              # LLM 配置管理
├── models/
│   └── SamplingPoint.js          # 采样点数据模型 (2dsphere索引)
├── routes/
│   ├── configRoutes.js           # LLM 配置接口
│   └── mapRoutes.js              # 空间数据查询接口
└── services/
    └── corsightService.js        # CorSight 空间查询服务
```

## 接口清单

### 1. 健康检查
- **GET** `/health`
- 返回服务器状态和时间戳

### 2. 空间查询
- **GET** `/api/navigation/nearby?lat={纬度}&lon={经度}&radius={半径(米)}`
- 查询指定位置附近的采样点
- 必需参数: `lat`, `lon`
- 可选参数: `radius` (默认 50 米)

### 3. LLM 配置管理
- **POST** `/api/config/llm` - 保存 LLM 配置
- **GET** `/api/config/llm/active` - 获取当前激活配置
- **GET** `/api/config/llm/models` - 获取可用模型列表

## 测试步骤

1. **安装依赖**
   ```bash
   cd backend
   npm install
   ```

2. **启动服务器**
   ```bash
   npm start
   # 或开发模式
   npm run dev
   ```

3. **运行测试脚本** (新终端)
   ```bash
   node test/test-server.js
   ```

4. **手动测试接口**
   ```bash
   # 健康检查
   curl http://localhost:3000/health
   
   # 空间查询
   curl "http://localhost:3000/api/navigation/nearby?lat=39.9095&lon=116.3976&radius=100"
   
   # 保存 LLM 配置
   curl -X POST http://localhost:3000/api/config/llm \
     -H "Content-Type: application/json" \
     -d '{"provider":"gemini","api_key":"test-key","model_name":"gemini-robotics-er-1.5-preview","is_active":true}'
   
   # 获取激活配置
   curl http://localhost:3000/api/config/llm/active
   ```

## 注意事项

1. MongoDB 需要在本地运行，或使用远程连接字符串
2. `.env` 文件中的 `MONGODB_URI` 可根据实际情况修改
3. LLM API Key 仅存储在内存中，服务器重启后需要重新配置