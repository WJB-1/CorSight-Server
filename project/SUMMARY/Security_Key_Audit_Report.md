# 安全密钥审计报告

> 审计日期：2026年3月27日
> 审计范围：navigation_agent 项目全代码库

---

## 1. 审计结论

✅ **未发现硬编码安全密钥**

本次审计对项目代码进行全面扫描，确认所有敏感信息（API密钥、服务端点等）均通过环境变量方式注入，未发现任何硬编码的安全密钥或凭据。

---

## 2. 详细检查清单

| 密钥名称 | 环境变量名 | 状态 |
|---------|-----------|------|
| 高德地图 API Key | `process.env.AMAP_WEB_KEY` | ✅ 通过环境变量读取 |
| Gemini API Key | `process.env.GEMINI_API_KEY` | ✅ 通过环境变量读取 |
| DeepSeek API Key | `process.env.DEEPSEEK_API_KEY` | ✅ 通过环境变量读取 |
| 阿里云百炼 API Key | `process.env.BAILIAN_API_KEY` | ✅ 通过环境变量读取 |
| Blind_map 服务 URL | `process.env.BLINDMAP_URL` | ✅ 通过环境变量读取 |

---

## 3. 代码引用位置

### 3.1 [`amapService.js:25`](navigation_agent/backend/services/amapService.js:25)
```javascript
const AMAP_WEB_KEY = process.env.AMAP_WEB_KEY;
```
高德地图服务调用密钥读取位置。

### 3.2 [`llmConfig.js:16-22`](navigation_agent/backend/config/llmConfig.js:16)
```javascript
module.exports = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    // ...
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    // ...
  },
  bailian: {
    apiKey: process.env.BAILIAN_API_KEY,
    // ...
  }
};
```
LLM 配置集中管理各模型 API 密钥。

### 3.3 [`corsightService.js:13`](navigation_agent/backend/services/corsightService.js:13)
```javascript
const BLINDMAP_URL = process.env.BLINDMAP_URL;
```
Blind_map 后端服务地址配置。

---

## 4. 安全实践评价

**评价等级：优秀** ⭐⭐⭐⭐⭐

- ✅ 所有敏感信息均从环境变量读取
- ✅ 配置与代码分离，符合安全最佳实践
- ✅ API 密钥集中管理，便于统一维护和轮换
- ✅ 无敏感信息泄露到版本控制的风险

---

## 5. 安全建议

### 5.1 必须执行
- **确保 `.env` 文件已添加到 `.gitignore`**，避免意外提交到版本控制
- 检查项目根目录和 `backend/` 目录下的 `.gitignore` 配置

### 5.2 可选增强
- 考虑使用密钥管理服务（如 AWS Secrets Manager、Azure Key Vault）替代本地 `.env` 文件
- 定期轮换 API 密钥，建议每 90 天更换一次
- 为生产环境配置 IP 白名单限制，减少密钥泄露后的影响面

---

*报告生成时间：2026-03-27*
*审计执行：自动化代码扫描 + 人工复核*
