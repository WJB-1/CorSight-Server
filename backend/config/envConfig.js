/**
 * 统一环境变量配置管理模块
 * 
 * 职责：
 * - 集中管理所有环境变量的读取
 * - 提供默认值回退逻辑
 * - 确保优先级：系统环境变量 > .env 文件 > 代码默认值
 * 
 * @module envConfig
 */

// 确保在模块加载时，dotenv 已经初始化（在 server.js 中最早执行）

/**
 * 安全获取环境变量
 * 优先使用系统环境变量，如果不存在则返回默认值
 * 
 * @param {string} key - 环境变量名
 * @param {string|number|null} defaultValue - 默认值
 * @returns {string|number|null} 环境变量值或默认值
 */
function getEnv(key, defaultValue = null) {
    // process.env 已经由 dotenv 和系统环境变量合并
    // dotenv 默认不会覆盖已存在的系统环境变量
    const value = process.env[key];
    return value !== undefined ? value : defaultValue;
}

/**
 * 获取整数类型的环境变量
 * @param {string} key - 环境变量名
 * @param {number} defaultValue - 默认值
 * @returns {number} 整数值
 */
function getEnvInt(key, defaultValue = 0) {
    const value = parseInt(getEnv(key), 10);
    return isNaN(value) ? defaultValue : value;
}

/**
 * 获取布尔类型的环境变量
 * @param {string} key - 环境变量名
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean} 布尔值
 */
function getEnvBool(key, defaultValue = false) {
    const value = getEnv(key);
    if (value === undefined || value === null) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
}

// ============================================
// 服务器配置
// ============================================
const serverConfig = {
    /** 服务器端口 */
    PORT: getEnvInt('PORT', 5741),
    /** 环境模式 */
    NODE_ENV: getEnv('NODE_ENV', 'development'),
    /** 是否开发环境 */
    isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
    /** 是否生产环境 */
    isProduction: getEnv('NODE_ENV', 'production') === 'production',
};

// ============================================
// 数据库配置
// ============================================
const dbConfig = {
    /** MongoDB 连接 URI */
    MONGODB_URI: getEnv('MONGODB_URI', 'mongodb://localhost:27017/nav_preview_db'),
};

// ============================================
// 高德地图配置
// ============================================
const amapConfig = {
    /** 高德 Web 服务 API Key */
    AMAP_WEB_KEY: getEnv('AMAP_WEB_KEY', ''),
    /** 是否配置了高德 Key */
    hasKey: !!getEnv('AMAP_WEB_KEY'),
};

// ============================================
// LLM API 配置
// ============================================
const llmApiConfig = {
    // Gemini
    GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),

    // DeepSeek
    DEEPSEEK_API_KEY: getEnv('DEEPSEEK_API_KEY', ''),

    // 阿里云百炼
    BAILIAN_API_KEY: getEnv('BAILIAN_API_KEY', ''),

    // HTTP 代理配置
    HTTP_PROXY: getEnv('HTTP_PROXY', ''),
    HTTPS_PROXY: getEnv('HTTPS_PROXY', ''),
    NO_PROXY: getEnv('NO_PROXY', 'localhost,127.0.0.1'),

    // 默认代理 URL（用于 LLM 客户端）
    getProxyUrl: function () {
        return this.HTTPS_PROXY || this.HTTP_PROXY || 'http://127.0.0.1:7890';
    },
};

// ============================================
// 外部服务配置
// ============================================
const externalServiceConfig = {
    /** Blind_map 后端服务 URL */
    BLINDMAP_URL: getEnv('BLINDMAP_URL', 'http://localhost:3001'),
};

// ============================================
// 环境变量映射（供前端或调试使用）
// ============================================
const envKeyMap = {
    gemini: 'GEMINI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    bailian: 'BAILIAN_API_KEY',
    qwen: 'BAILIAN_API_KEY',
    aliyun: 'BAILIAN_API_KEY',
};

// ============================================
// 导出统一配置对象
// ============================================
const config = {
    server: serverConfig,
    database: dbConfig,
    amap: amapConfig,
    llm: llmApiConfig,
    external: externalServiceConfig,
    envKeyMap,

    // 工具函数
    getEnv,
    getEnvInt,
    getEnvBool,
};

// 验证关键配置（开发时帮助发现问题）
function validateConfig() {
    const warnings = [];

    if (!amapConfig.hasKey) {
        warnings.push('[Config] AMAP_WEB_KEY 未配置，高德地图功能将不可用');
    }

    const hasAnyLlmKey = llmApiConfig.GEMINI_API_KEY ||
        llmApiConfig.DEEPSEEK_API_KEY ||
        llmApiConfig.BAILIAN_API_KEY;

    if (!hasAnyLlmKey) {
        warnings.push('[Config] 未配置任何 LLM API Key，AI 功能将不可用');
    }

    return warnings;
}

// 导出验证函数
config.validate = validateConfig;

module.exports = config;
