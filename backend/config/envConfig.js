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

// ── OSM 数据与 osmium ─────────────────────────────
const osmConfig = {
  /** osmium.exe 绝对路径 */
  OSMIUM_PATH: getEnv('OSMIUM_PATH', 'D:\\project_file\\CorSight_Navigation\\osmium-tool-1.19.0\\build2\\src\\osmium.exe'),
  /** osm_data 工作目录 */
  OSM_DATA_DIR: getEnv('OSM_DATA_DIR', 'D:\\project_file\\CorSight_Navigation\\CorSight_v1.0\\osm_data'),
  /** 省级底图 PBF（只读，用于裁剪） */
  OSM_BASE_PBF: getEnv('OSM_BASE_PBF', 'guangdong-260611.osm.pbf'),
  /** 城市级工作区 OSM（日常查询用，9 秒扫描） */
  OSM_WORKSPACE: getEnv('OSM_WORKSPACE', 'guangzhou.osm'),
  /** 城市级工作区 PBF（供 GraphHopper / 标签注入用） */
  OSM_WORKSPACE_PBF: getEnv('OSM_WORKSPACE_PBF', 'guangzhou.pbf'),
  /** GraphHopper JAR 路径 */
  GRAPHHOPPER_JAR: getEnv('GRAPHHOPPER_JAR', 'D:\\project_file\\CorSight_Navigation\\CorSight_v1.0\\graphhopper\\graphhopper-web-10.0.jar'),
  /** GraphHopper 配置文件 */
  GRAPHHOPPER_CONFIG: getEnv('GRAPHHOPPER_CONFIG', 'D:\\project_file\\CorSight_Navigation\\CorSight_v1.0\\graphhopper\\config.yml'),
  /** 累积多少个 pending 标签后自动触发注入（0=禁用自动触发） */
  AUTO_INJECT_THRESHOLD: getEnvInt('AUTO_INJECT_THRESHOLD', 20),
  /** Python 解释器路径（需要有 shapely/pymongo/osmium 包） */
  PYTHON_PATH: getEnv('PYTHON_PATH', 'D:\\anaconda\\python.exe'),
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
  osm: osmConfig,
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
