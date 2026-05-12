/**
 * LLM 配置管理模块 (Phase 4 补充)
 *
 * 功能：
 * - 从环境变量读取 API Key（不再接收前端传入的 api_key）
 * - 管理当前激活的 Provider 和 Model
 * - 提供模型可用性探测支持
 *
 * 环境变量配置 (.env):
 * - GEMINI_API_KEY
 * - DEEPSEEK_API_KEY
 * - BAILIAN_API_KEY
 */

const { llm: llmConfig, envKeyMap: ENV_KEY_MAP } = require('./envConfig');

// 从统一配置模块导入环境变量映射
// 注意：ENV_KEY_MAP 现在从 envConfig.js 导入，保持单一数据源

// 内存存储配置（仅用于存储激活状态，不再存储 API Key）
const configStore = {
  // 当前激活的配置（向后兼容）
  activeProvider: null,
  activeModel: null,

  // 固定模型配置（已测试验证，不再支持动态切换）
  // 视觉模型（从Agent）：负责街景图片分析
  visionModel: 'qwen-vl-max',
  visionProvider: 'bailian',
  // 文本模型（主Agent）：负责播报文案生成
  // 注：deepseek-v4-pro thinking 模式 OpenAI SDK 兼容性差，content 常返回空
  // 改用 deepseek-chat（V4 Flash 非thinking 别名），稳定性更好
  textModel: 'deepseek-chat',
  textProvider: 'deepseek',

  // 各 Provider 的模型列表（根据 test-all-models.js 测试结果更新）
  //
  // ✅ Gemini 可用模型：
  //   - gemini-3-flash-preview (4288ms, 推荐)
  //   - gemini-2.5-flash (3461ms, 最快)
  //   - gemini-2.5-flash-lite (4202ms)
  //   - gemini-3.1-flash-lite-preview (4954ms)
  //   - gemini-robotics-er-1.5-preview (7194ms)
  // ⚠️ 配额耗尽：gemini-2.5-pro, gemini-3.1-pro-preview
  // ❌ 不可用：gemini-embedding-2-preview, gemini-2.5-flash-lite-preview-09-2025 (404)
  //
  // ✅ 阿里云百炼视觉模型：
  //   - qwen-vl-plus (1452ms, 推荐)
  //   - qwen3-vl-flash (2002ms)
  //   - qwen3-vl-plus (3045ms)
  //   - qwen-vl-max (3278ms)
  //   - qvq-plus-latest (9787ms)
  //   - qvq-plus-2025-05-15 (9907ms)
  // ❌ 不支持 HTTP: qvq-max
  //
  // ✅ 阿里云百炼纯文本模型：
  //   - kimi-k2.5 (1016ms, 推荐)
  //   - kimi/kimi-k2.5 (1563ms)
  //   - kimi-k2-thinking (2040ms)
  availableModels: {
    gemini: [
      'gemini-2.5-flash',                  // ✅ 可用，速度最快
      'gemini-3-flash-preview',            // ✅ 可用，推荐
      'gemini-2.5-flash-lite',             // ✅ 可用
      'gemini-3.1-flash-lite-preview',     // ✅ 可用
      'gemini-robotics-er-1.5-preview',    // ✅ 可用
      'gemini-2.5-pro',                    // ⚠️ 配额耗尽，谨慎使用
      'gemini-3.1-pro-preview',            // ⚠️ 配额耗尽，谨慎使用
    ],
    deepseek: [
      'deepseek-chat',
      'deepseek-coder'
    ],
    bailian: [
      // 视觉模型
      'qwen-vl-plus',              // ✅ 最快视觉模型
      'qwen3-vl-flash',            // ✅ Qwen3 系列
      'qwen3-vl-plus',             // ✅ Qwen3 系列
      'qwen-vl-max',               // ✅ 可用
      'qvq-plus-latest',           // ✅ 可用
      'qvq-plus-2025-05-15',       // ✅ 可用
      'qwen2.5-vl-72b-instruct',
      'qwen2.5-vl-32b-instruct',
      // 纯文本模型
      'kimi-k2.5',                 // ✅ 最快文本模型
      'kimi/kimi-k2.5',            // ✅ 可用
      'kimi-k2-thinking',          // ✅ 可用
    ],
    // 保留旧版 provider 兼容
    openai: [
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ],
    anthropic: [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ],
    azure: [
      'gpt-4o',
      'gpt-4',
      'gpt-35-turbo'
    ]
  },

  // 模型能力标记（是否支持多模态）
  // 根据 test-all-models.js 测试结果更新
  modelCapabilities: {
    // Gemini 视觉模型
    'gemini-2.5-flash': { multimodal: true },                  // ✅ 可用
    'gemini-2.5-flash-lite': { multimodal: true },             // ✅ 可用
    'gemini-2.5-pro': { multimodal: true },                    // ⚠️ 配额耗尽
    'gemini-3-flash-preview': { multimodal: true },            // ✅ 可用
    'gemini-3.1-flash-lite-preview': { multimodal: true },     // ✅ 可用
    'gemini-robotics-er-1.5-preview': { multimodal: true },    // ✅ 可用
    'gemini-3.1-pro-preview': { multimodal: true },            // ⚠️ 配额耗尽

    // 阿里云百炼视觉模型
    'qwen-vl-plus': { multimodal: true },              // ✅ 最快
    'qwen-vl-max': { multimodal: true },               // ✅ 可用
    'qwen3-vl-flash': { multimodal: true },            // ✅ Qwen3
    'qwen3-vl-plus': { multimodal: true },             // ✅ Qwen3
    'qvq-plus-latest': { multimodal: true },           // ✅ 可用
    'qvq-plus-2025-05-15': { multimodal: true },       // ✅ 可用
    'qwen2.5-vl-72b-instruct': { multimodal: true },
    'qwen2.5-vl-32b-instruct': { multimodal: true },

    // 阿里云百炼纯文本模型
    'kimi-k2.5': { multimodal: false },                // ✅ 最快文本
    'kimi/kimi-k2.5': { multimodal: false },           // ✅ 可用
    'kimi-k2-thinking': { multimodal: false },         // ✅ 可用

    // DeepSeek 模型
    'deepseek-chat': { multimodal: false },
    'deepseek-coder': { multimodal: false }
  }
};

/**
 * 获取 API Key（从环境变量读取）
 * @param {string} provider - 提供商名称 (gemini, deepseek, bailian, etc.)
 * @returns {string|null} API Key 或 null
 */
function getKey(provider) {
  if (!provider || typeof provider !== 'string') {
    return null;
  }

  const providerLower = provider.toLowerCase();

  // 使用统一配置模块获取 API Key
  const envVarName = ENV_KEY_MAP[providerLower];

  if (!envVarName) {
    console.warn(`[llmConfig] 未知的 provider: ${provider}`);
    return null;
  }

  // 从统一配置模块获取 Key（不再直接访问 process.env）
  let key = null;
  switch (envVarName) {
    case 'GEMINI_API_KEY':
      key = llmConfig.GEMINI_API_KEY;
      break;
    case 'DEEPSEEK_API_KEY':
      key = llmConfig.DEEPSEEK_API_KEY;
      break;
    case 'BAILIAN_API_KEY':
      key = llmConfig.BAILIAN_API_KEY;
      break;
    default:
      key = null;
  }

  // 检查是否为占位符
  if (key && (key.includes('your_') || key.includes('placeholder'))) {
    return null;
  }

  return key || null;
}

/**
 * 设置 API Key（向后兼容，实际不再存储到内存）
 * @deprecated 请直接在 .env 文件中配置 API Key
 * @param {string} provider - 提供商名称
 * @param {string} key - API Key
 */
function setKey(provider, key) {
  console.warn('[llmConfig] setKey() 已废弃，请在 .env 文件中配置 API Key');
  // 不再存储到内存，仅记录日志
  console.log(`[llmConfig] 提示: 请将 ${provider} 的 API Key 配置到 .env 文件的 ${ENV_KEY_MAP[provider.toLowerCase()]} 变量中`);
}

/**
 * 设置当前激活的模型
 * @param {string} provider - 提供商名称
 * @param {string} modelName - 模型名称
 */
function setActiveModel(provider, modelName) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('Provider must be a non-empty string');
  }

  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Model name must be a non-empty string');
  }

  const providerLower = provider.toLowerCase();

  // 验证 provider 是否支持
  if (!configStore.availableModels[providerLower]) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  configStore.activeProvider = providerLower;
  configStore.activeModel = modelName;

  console.log(`[llmConfig] 激活模型: ${providerLower} / ${modelName}`);
}

/**
 * 根据模型名称自动推断 provider
 * @param {string} modelName - 模型名称
 * @returns {string|null} provider 名称或 null
 */
function inferProviderFromModel(modelName) {
  if (!modelName) return null;

  const modelLower = modelName.toLowerCase();

  // Gemini 模型
  if (modelLower.startsWith('gemini')) return 'gemini';

  // DeepSeek 模型
  if (modelLower.startsWith('deepseek')) return 'deepseek';

  // 阿里云百炼模型 (Qwen/Kimi)
  if (modelLower.startsWith('qwen') || modelLower.startsWith('qvq') || modelLower.startsWith('kimi')) {
    return 'bailian';
  }

  return null;
}

/**
 * 设置视觉模型（用于多模态推理）
 * @param {string} modelName - 模型名称
 */
function setVisionModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Model name must be a non-empty string');
  }

  // 验证模型是否支持多模态
  if (!isMultimodalSupported(modelName)) {
    console.warn(`[llmConfig] 警告: ${modelName} 可能不支持多模态`);
  }

  configStore.visionModel = modelName;

  // 同时推断并设置 provider
  const provider = inferProviderFromModel(modelName);
  if (provider) {
    configStore.activeProvider = provider;
  }

  console.log(`[llmConfig] 设置视觉模型: ${modelName}`);
}

/**
 * 设置文本模型（用于文本生成）
 * @param {string} modelName - 模型名称
 */
function setTextModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('Model name must be a non-empty string');
  }

  configStore.textModel = modelName;

  // 同时推断并设置 provider（如果视觉模型未设置）
  if (!configStore.visionModel) {
    const provider = inferProviderFromModel(modelName);
    if (provider) {
      configStore.activeProvider = provider;
    }
  }

  console.log(`[llmConfig] 设置文本模型: ${modelName}`);
}

/**
 * 获取视觉模型配置（从Agent - 固定为 qwen-vl-max）
 * @returns {Object} 视觉模型配置
 */
function getVisionModel() {
  return {
    modelName: configStore.visionModel,
    provider: configStore.visionProvider,
    capabilities: { multimodal: true },
    role: '从Agent',
    description: '负责街景图片分析'
  };
}

/**
 * 获取文本模型配置（主Agent - 固定为 deepseek-v4-pro）
 * @returns {Object} 文本模型配置
 */
function getTextModel() {
  return {
    modelName: configStore.textModel,
    provider: configStore.textProvider,
    capabilities: { multimodal: false },
    role: '主Agent',
    description: '负责播报文案生成',
    thinkingMode: true
  };
}

/**
 * 获取模型推荐分类（视觉模型 vs 文本模型）
 * @returns {Object} 分类后的模型列表
 */
function getClassifiedModels() {
  const allModels = getAvailableModels();
  const visionModels = [];
  const textModels = [];

  for (const [provider, models] of Object.entries(allModels)) {
    for (const model of models) {
      const capabilities = getModelCapabilities(model);
      const modelInfo = {
        name: model,
        provider: provider,
        capabilities: capabilities
      };

      if (capabilities.multimodal) {
        visionModels.push(modelInfo);
      } else {
        textModels.push(modelInfo);
      }
    }
  }

  return {
    vision: visionModels,
    text: textModels
  };
}

/**
 * 获取当前激活的配置
 * @returns {Object} 包含 activeProvider 和 activeModel 的对象
 */
function getActiveConfig() {
  return {
    active_provider: configStore.activeProvider,
    active_model: configStore.activeModel,
    has_active_key: configStore.activeProvider
      ? hasKey(configStore.activeProvider)
      : false
  };
}

/**
 * 获取当前激活的 API Key
 * @returns {string|null} 当前激活的 API Key 或 null
 */
function getActiveKey() {
  if (!configStore.activeProvider) {
    return null;
  }

  return getKey(configStore.activeProvider);
}

/**
 * 获取当前激活的模型完整信息
 * @returns {Object|null} 包含 provider 和 model 的对象
 */
function getActiveModel() {
  if (!configStore.activeProvider || !configStore.activeModel) {
    return null;
  }

  return {
    provider: configStore.activeProvider,
    modelName: configStore.activeModel,
    capabilities: getModelCapabilities(configStore.activeModel)
  };
}

/**
 * 获取所有可用的模型列表
 * @returns {Object} 各 Provider 的可用模型列表
 */
function getAvailableModels() {
  return { ...configStore.availableModels };
}

/**
 * 获取指定模型的能力信息
 * @param {string} modelName - 模型名称
 * @returns {Object} 模型能力信息
 */
function getModelCapabilities(modelName) {
  return configStore.modelCapabilities[modelName] || { multimodal: false };
}

/**
 * 清除指定 Provider 的 API Key（向后兼容，实际不再生效）
 * @deprecated 请直接在 .env 文件中修改 API Key
 * @param {string} provider - 提供商名称
 */
function clearKey(provider) {
  console.warn('[llmConfig] clearKey() 已废弃，请直接在 .env 文件中修改 API Key');
}

/**
 * 获取所有已配置 Key 的 Provider 列表
 * @returns {Array<string>} 已配置 Key 的 Provider 列表
 */
function getConfiguredProviders() {
  const providers = [];

  for (const [provider, envVar] of Object.entries(ENV_KEY_MAP)) {
    if (process.env[envVar] && !process.env[envVar].includes('your_')) {
      if (!providers.includes(provider)) {
        providers.push(provider);
      }
    }
  }

  return providers;
}

/**
 * 验证指定 Provider 是否有配置 Key
 * @param {string} provider - 提供商名称
 * @returns {boolean} 是否已配置
 */
function hasKey(provider) {
  if (!provider || typeof provider !== 'string') {
    return false;
  }

  return getKey(provider) !== null;
}

/**
 * 获取环境变量映射信息
 * @returns {Object} provider 到环境变量的映射
 */
function getEnvKeyMap() {
  return { ...ENV_KEY_MAP };
}

/**
 * 检查是否支持多模态
 * @param {string} modelName - 模型名称
 * @returns {boolean} 是否支持多模态
 */
function isMultimodalSupported(modelName) {
  const capabilities = getModelCapabilities(modelName);
  return capabilities.multimodal === true;
}

module.exports = {
  // 核心函数
  getKey,
  setKey, // 向后兼容
  setActiveModel,
  getActiveConfig,
  getActiveKey,
  getActiveModel,
  getAvailableModels,
  getModelCapabilities,
  clearKey, // 向后兼容
  getConfiguredProviders,
  hasKey,
  getEnvKeyMap,
  isMultimodalSupported,
  // 优化：新增视觉/文本模型分离函数
  setVisionModel,
  setTextModel,
  getVisionModel,
  getTextModel,
  getClassifiedModels,
  inferProviderFromModel
};
