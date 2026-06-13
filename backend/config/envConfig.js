/**
 * 统一环境变量配置管理模块
 *
 * 职责：
 * - 集中管理所有环境变量的读取
 * - 提供默认值回退逻辑
 * - 优先级：系统环境变量 > .env 文件 > 代码默认值
 *
 * @module envConfig
 */

function getEnv(key, defaultValue = null) {
  const value = process.env[key];
  return value !== undefined ? value : defaultValue;
}

function getEnvInt(key, defaultValue = 0) {
  const value = parseInt(getEnv(key), 10);
  return isNaN(value) ? defaultValue : value;
}

function getEnvBool(key, defaultValue = false) {
  const value = getEnv(key);
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
}

// ── 服务器 ────────────────────────────────────────
const serverConfig = {
  PORT: getEnvInt('PORT', 5741),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
  isProduction: getEnv('NODE_ENV') === 'production',
};

// ── 数据库 ────────────────────────────────────────
const dbConfig = {
  MONGODB_URI: getEnv('MONGODB_URI', 'mongodb://localhost:27017/corsight_v2'),
};

// ── 高德地图 ──────────────────────────────────────
const amapConfig = {
  AMAP_WEB_KEY: getEnv('AMAP_WEB_KEY', ''),
  hasKey: !!getEnv('AMAP_WEB_KEY'),
};

// ── GraphHopper ───────────────────────────────────
const graphhopperConfig = {
  GRAPHHOPPER_URL: getEnv('GRAPHHOPPER_URL', 'http://localhost:8989'),
};

// ── LLM API Keys ─────────────────────────────────
const llmConfig = {
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),
  DEEPSEEK_API_KEY: getEnv('DEEPSEEK_API_KEY', ''),
  BAILIAN_API_KEY: getEnv('BAILIAN_API_KEY', ''),
};

// ── 代理 ──────────────────────────────────────────
const proxyConfig = {
  HTTP_PROXY: getEnv('HTTP_PROXY', ''),
  HTTPS_PROXY: getEnv('HTTPS_PROXY', ''),
  NO_PROXY: getEnv('NO_PROXY', 'localhost,127.0.0.1'),
  /** 返回代理 URL，无配置时返回 null（不再硬编码 7890） */
  getProxyUrl() {
    return this.HTTPS_PROXY || this.HTTP_PROXY || null;
  },
};

// ── 导出 ──────────────────────────────────────────
const config = {
  server: serverConfig,
  database: dbConfig,
  amap: amapConfig,
  graphhopper: graphhopperConfig,
  llm: llmConfig,
  proxy: proxyConfig,
  getEnv,
  getEnvInt,
  getEnvBool,
};

function validateConfig() {
  const warnings = [];
  if (!amapConfig.hasKey) {
    warnings.push('[Config] AMAP_WEB_KEY 未配置，高德地图功能将不可用');
  }
  const hasAnyLlmKey =
    llmConfig.GEMINI_API_KEY || llmConfig.DEEPSEEK_API_KEY || llmConfig.BAILIAN_API_KEY;
  if (!hasAnyLlmKey) {
    warnings.push('[Config] 未配置任何 LLM API Key，AI 功能将不可用');
  }
  return warnings;
}

config.validate = validateConfig;

module.exports = config;
