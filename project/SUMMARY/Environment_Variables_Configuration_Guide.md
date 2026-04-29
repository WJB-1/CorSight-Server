# CorSight Navigation - 环境变量配置指南

**文档版本**: 1.0  
**最后更新**: 2026-03-27  
**适用范围**: navigation_agent/backend

---

## 一、重构概述

本次重构将散落在各处的 `process.env.XXX` 调用集中到统一的配置管理系统，实现以下目标：

1. **单一数据源**: 所有环境变量读取通过 `config/envConfig.js` 管理
2. **明确的优先级**: 系统环境变量 > .env 文件 > 代码默认值
3. **容器化友好**: 支持 Docker/K8s 环境（无需 .env 文件）
4. **类型安全**: 提供 `getEnv()`, `getEnvInt()`, `getEnvBool()` 等工具函数

---

## 二、环境变量优先级

```
┌─────────────────────────────────────────────────────────────┐
│  优先级 1: 系统环境变量 (System Environment)                  │
│     └─ 操作系统或容器注入的环境变量（最高优先级）              │
├─────────────────────────────────────────────────────────────┤
│  优先级 2: .env 文件                                          │
│     └─ 项目根目录下的 .env 文件（仅当系统变量不存在时生效）    │
├─────────────────────────────────────────────────────────────┤
│  优先级 3: 代码默认值                                          │
│     └─ envConfig.js 中定义的默认值（最低优先级）              │
└─────────────────────────────────────────────────────────────┘
```

**重要说明**:
- `dotenv.config({ override: false })` 确保系统环境变量不会被 .env 文件覆盖
- 这在 Docker/K8s 部署中尤为重要，允许通过容器编排工具注入敏感配置

---

## 三、必需的环境变量

### 3.1 基础服务配置

| 变量名 | 说明 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| `PORT` | 后端服务端口 | `3000` | 否 |
| `NODE_ENV` | 运行环境 | `development` | 否 |
| `MONGODB_URI` | MongoDB 连接字符串 | `mongodb://localhost:27017/nav_preview_db` | 否 |

### 3.2 高德地图 API（必需）

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `AMAP_WEB_KEY` | 高德地图 Web 服务 API Key | [高德开放平台](https://lbs.amap.com/) |

**影响功能**: 路径规划、步行导航

### 3.3 LLM API 配置（至少配置一个）

| 变量名 | 说明 | 用途 |
|--------|------|------|
| `GEMINI_API_KEY` | Google Gemini API Key | 视觉分析 + 文本生成 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 文本生成 |
| `BAILIAN_API_KEY` | 阿里云百炼 API Key | 视觉分析 + 文本生成 |

**建议配置**:
- **视觉模型**（街景分析）: Gemini 或阿里云百炼
- **文本模型**（播报生成）: DeepSeek 或阿里云百炼

### 3.4 代理配置（可选）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `HTTP_PROXY` | HTTP 代理地址 | - |
| `HTTPS_PROXY` | HTTPS 代理地址 | `http://127.0.0.1:7890` |
| `NO_PROXY` | 不走代理的地址 | `localhost,127.0.0.1` |

**适用场景**: 在中国大陆访问 Gemini/DeepSeek 等海外 API 时需要代理

### 3.5 外部服务配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `BLINDMAP_URL` | Blind_map 后端服务地址 | `http://localhost:3001` |

**说明**: 用于查询街景采样点数据

---

## 四、.env 文件模板

在项目根目录创建 `.env` 文件：

```bash
# ============================================
# CorSight Navigation - 环境变量配置
# ============================================

# 基础服务
PORT=3002
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/nav_preview_db

# 高德地图 API（必须配置）
# 获取地址: https://lbs.amap.com/dev/key
AMAP_WEB_KEY=your_amap_web_key_here

# ============================================
# LLM API 配置（至少配置一个）
# ============================================

# Google Gemini API
# 获取地址: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# DeepSeek API
# 获取地址: https://platform.deepseek.com/
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 阿里云百炼 API
# 获取地址: https://bailian.console.aliyun.com/
BAILIAN_API_KEY=your_bailian_api_key_here

# ============================================
# 代理配置（国内访问海外 API 时需要）
# ============================================

# HTTP/HTTPS 代理
HTTPS_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1

# ============================================
# 外部服务配置
# ============================================

# Blind_map 后端服务地址（用于获取街景数据）
BLINDMAP_URL=http://localhost:3001
```

---

## 五、配置验证

### 5.1 启动时自动验证

重构后的系统在启动时会自动验证关键配置：

```javascript
// server.js 启动时
const warnings = config.validate();
if (warnings.length > 0 && config.server.isDevelopment) {
  warnings.forEach(w => console.warn(w));
}
```

**警告输出示例**:
```
[Config] AMAP_WEB_KEY 未配置，高德地图功能将不可用
[Config] 未配置任何 LLM API Key，AI 功能将不可用
```

### 5.2 健康检查接口

访问健康检查接口查看配置状态：

```bash
curl http://localhost:3002/api/config/llm/status
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "configured_providers": ["gemini", "bailian"],
    "env_key_map": {
      "gemini": "GEMINI_API_KEY",
      "deepseek": "DEEPSEEK_API_KEY",
      "bailian": "BAILIAN_API_KEY"
    }
  }
}
```

---

## 六、Docker/K8s 部署

### 6.1 Docker 示例

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# 不需要 COPY .env 文件，通过环境变量注入
EXPOSE 3000
CMD ["node", "backend/server.js"]
```

```bash
# 运行容器时注入环境变量
docker run -e GEMINI_API_KEY=xxx \
           -e AMAP_WEB_KEY=xxx \
           -e MONGODB_URI=mongodb://host:27017/db \
           -p 3000:3000 \
           corsight-navigation
```

### 6.2 Kubernetes ConfigMap + Secret 示例

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: corsight-config
data:
  PORT: "3000"
  NODE_ENV: "production"
  MONGODB_URI: "mongodb://mongo-service:27017/nav_db"
  BLINDMAP_URL: "http://blindmap-service:3001"
  HTTPS_PROXY: "http://proxy-service:7890"
---
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: corsight-secrets
type: Opaque
stringData:
  AMAP_WEB_KEY: "your_amap_key"
  GEMINI_API_KEY: "your_gemini_key"
  BAILIAN_API_KEY: "your_bailian_key"
```

---

## 七、代码中如何使用配置

### 7.1 后端服务中使用

```javascript
// 推荐方式：使用统一配置模块
const config = require('./config/envConfig');

// 获取配置
const port = config.server.PORT;
const mongoUri = config.database.MONGODB_URI;
const amapKey = config.amap.AMAP_WEB_KEY;

// 获取代理 URL
const proxyUrl = config.llm.getProxyUrl();
```

### 7.2 新增环境变量步骤

1. **在 `envConfig.js` 中添加配置项**:
```javascript
const myNewConfig = {
  MY_NEW_VAR: getEnv('MY_NEW_VAR', 'default_value'),
};
```

2. **添加到 `config` 对象导出**:
```javascript
const config = {
  // ... 其他配置
  myModule: myNewConfig,
};
```

3. **在 `.env.example` 中添加示例**（供其他开发者参考）

---

## 八、故障排查

### 8.1 常见问题

**Q: 配置了 .env 文件但不起作用？**

检查 .env 文件位置，确保在项目根目录（与 backend/ 同级），而非 backend/ 目录内。

**Q: Docker 中环境变量被 .env 文件覆盖？**

确认 `dotenv.config({ override: false })` 配置正确。如问题仍存在，检查是否误将 .env 文件打包进镜像。

**Q: 代理配置不生效？**

检查 `HTTPS_PROXY` 格式，应为 `http://host:port`（即使代理的是 HTTPS 流量，协议也是 http://）。

### 8.2 调试模式

在代码中打印当前配置（仅用于调试，生产环境慎用）：

```javascript
const config = require('./config/envConfig');

// 打印配置（会自动隐藏敏感信息）
console.log('Server Port:', config.server.PORT);
console.log('Has AMAP Key:', config.amap.hasKey);
console.log('Has Gemini Key:', !!config.llm.GEMINI_API_KEY);
```

---

## 九、安全建议

1. **绝不提交 .env 文件到版本控制**
   ```bash
   # 确保 .gitignore 包含
   .env
   .env.local
   .env.*.local
   ```

2. **定期轮换 API Key**
   - 高德地图、Gemini、阿里云等平台都支持重新生成 Key
   - 建议在 `Security_Key_Audit_Report.md` 中记录轮换周期

3. **使用不同的 Key 用于不同环境**
   - 开发环境、测试环境、生产环境应使用独立的 API Key
   - 便于权限管理和问题追踪

4. **监控 API 用量**
   - 大部分 LLM API 提供商都有用量监控面板
   - 建议设置用量告警，防止意外超支

---

## 十、变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-03-27 | 1.0 | 初始版本，完成环境变量配置重构 |

---

**相关文档**:
- [Architecture_API_Report.md](./Architecture_API_Report.md) - API 架构分析报告
- [Security_Key_Audit_Report.md](./Security_Key_Audit_Report.md) - 安全密钥审计报告
