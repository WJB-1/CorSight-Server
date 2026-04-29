const express = require('express');
const router = express.Router();
const llmConfig = require('../config/llmConfig');
const modelTester = require('../services/modelTester');

/**
 * 配置管理路由 (Phase 4 补充)
 * 
 * 变更说明：
 * - API Key 不再从前端传入，改为从 .env 环境变量读取
 * - 新增模型探测接口 /probe
 */

/**
 * POST /api/config/llm
 * 保存 LLM 配置（仅设置 provider 和 model_name，不再接收 api_key）
 * 
 * Request Body:
 * {
 *   "provider": "gemini",
 *   "model_name": "gemini-3.1-pro-preview"
 * }
 */
router.post('/', (req, res) => {
  try {
    const { provider, model_name } = req.body;

    // 验证必填参数
    if (!provider) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: provider'
      });
    }

    if (!model_name) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: model_name'
      });
    }

    // 检查 provider 是否支持
    const availableModels = llmConfig.getAvailableModels();
    if (!availableModels[provider.toLowerCase()]) {
      return res.status(400).json({
        success: false,
        error: `不支持的 provider: ${provider}`,
        supported_providers: Object.keys(availableModels)
      });
    }

    // 检查该 provider 是否已配置 API Key
    if (!llmConfig.hasKey(provider)) {
      return res.status(400).json({
        success: false,
        error: `${provider} 的 API Key 未配置`,
        message: `请在 .env 文件中设置 ${llmConfig.getEnvKeyMap()[provider.toLowerCase()]} 环境变量`
      });
    }

    // 设置为当前活跃配置
    llmConfig.setActiveModel(provider, model_name);

    res.json({
      success: true,
      message: '配置已保存',
      data: {
        provider: provider.toLowerCase(),
        model_name: model_name,
        api_key_configured: true,
        api_key_source: 'environment_variable'
      }
    });

  } catch (error) {
    console.error('[configRoutes] 保存配置失败:', error.message);
    
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/config/llm/active
 * 获取当前激活的 LLM 配置
 */
router.get('/active', (req, res) => {
  try {
    const activeConfig = llmConfig.getActiveConfig();
    const envKeyMap = llmConfig.getEnvKeyMap();

    res.json({
      success: true,
      ...activeConfig,
      env_key_variables: envKeyMap
    });

  } catch (error) {
    console.error('[configRoutes] 获取激活配置失败:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/llm/models
 * 获取所有可用的模型列表
 * 
 * Phase 4 补充：返回候选模型及其配置状态
 */
router.get('/models', (req, res) => {
  try {
    const allModels = llmConfig.getAvailableModels();
    const candidateModels = modelTester.getCandidateModels();
    const configuredProviders = llmConfig.getConfiguredProviders();
    const envKeyMap = llmConfig.getEnvKeyMap();

    // 构建详细的模型列表
    const detailedModels = {};
    for (const [provider, models] of Object.entries(allModels)) {
      detailedModels[provider] = models.map(model => ({
        name: model,
        is_candidate: candidateModels[provider]?.includes(model) || false,
        is_multimodal: llmConfig.isMultimodalSupported(model),
        api_key_configured: configuredProviders.includes(provider),
        env_variable: envKeyMap[provider]
      }));
    }

    res.json({
      success: true,
      data: {
        all_models: detailedModels,
        candidate_models: candidateModels,
        configured_providers: configuredProviders,
        env_key_map: envKeyMap
      }
    });

  } catch (error) {
    console.error('[configRoutes] 获取模型列表失败:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/llm/probe
 * 探测候选模型的可用性 (Phase 4 补充)
 * 
 * 测试 Gemini、DeepSeek、阿里云百炼下的候选模型
 * 返回每个模型的可用性状态
 */
router.get('/probe', async (req, res) => {
  try {
    console.log('[configRoutes] 开始模型可用性探测...');
    
    // 执行探测
    const results = await modelTester.probeAvailableModels();
    
    // 生成摘要
    const summary = modelTester.getProbeSummary(results);
    
    res.json({
      success: true,
      data: {
        results: results,
        summary: summary
      }
    });

  } catch (error) {
    console.error('[configRoutes] 模型探测失败:', error.message);
    
    res.status(500).json({
      success: false,
      error: '模型探测失败',
      message: error.message
    });
  }
});

/**
 * GET /api/config/llm/status
 * 获取 LLM 配置状态（用于调试）
 */
router.get('/status', (req, res) => {
  try {
    const configuredProviders = llmConfig.getConfiguredProviders();
    const activeConfig = llmConfig.getActiveConfig();
    const envKeyMap = llmConfig.getEnvKeyMap();
    const candidateModels = modelTester.getCandidateModels();

    res.json({
      success: true,
      data: {
        configured_providers: configuredProviders,
        active_config: activeConfig,
        env_key_map: envKeyMap,
        candidate_models: candidateModels,
        phase: 'Phase 4 - API Key from Environment'
      }
    });

  } catch (error) {
    console.error('[configRoutes] 获取配置状态失败:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/llm/env-info
 * 获取环境变量配置信息（不含敏感值）
 */
router.get('/env-info', (req, res) => {
  try {
    const envKeyMap = llmConfig.getEnvKeyMap();
    const configuredProviders = llmConfig.getConfiguredProviders();
    
    // 构建环境变量状态（仅显示是否配置，不显示值）
    const envStatus = {};
    for (const [provider, envVar] of Object.entries(envKeyMap)) {
      // 去重处理
      if (!envStatus[envVar]) {
        envStatus[envVar] = {
          provider: provider,
          configured: configuredProviders.includes(provider),
          variable_name: envVar
        };
      }
    }

    res.json({
      success: true,
      data: {
        env_variables: envStatus,
        configured_count: configuredProviders.length,
        note: 'API Keys 已从 .env 文件读取，不再通过前端配置'
      }
    });

  } catch (error) {
    console.error('[configRoutes] 获取环境信息失败:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/config/models/classified
 * 获取分类后的模型列表（视觉模型 vs 文本模型）
 */
router.get('/models/classified', (req, res) => {
  try {
    const classified = llmConfig.getClassifiedModels();
    const visionModel = llmConfig.getVisionModel();
    const textModel = llmConfig.getTextModel();

    res.json({
      success: true,
      data: classified,
      current: {
        vision: visionModel,
        text: textModel
      }
    });
  } catch (error) {
    console.error('[configRoutes] 获取分类模型失败:', error);
    res.status(500).json({
      success: false,
      error: '获取模型列表失败',
      message: error.message
    });
  }
});

/**
 * POST /api/config/models/vision
 * 设置视觉模型
 */
router.post('/models/vision', (req, res) => {
  try {
    const { model_name } = req.body;

    if (!model_name) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: model_name'
      });
    }

    // 检查模型是否支持多模态
    if (!llmConfig.isMultimodalSupported(model_name)) {
      return res.status(400).json({
        success: false,
        error: `${model_name} 不支持多模态，不能作为视觉模型`,
        message: '请选择支持多模态的模型（如 qwen-vl-plus, gemini-2.5-flash 等）'
      });
    }

    llmConfig.setVisionModel(model_name);

    res.json({
      success: true,
      message: `视觉模型已设置为: ${model_name}`,
      data: llmConfig.getVisionModel()
    });
  } catch (error) {
    console.error('[configRoutes] 设置视觉模型失败:', error);
    res.status(500).json({
      success: false,
      error: '设置视觉模型失败',
      message: error.message
    });
  }
});

/**
 * POST /api/config/models/text
 * 设置文本模型
 */
router.post('/models/text', (req, res) => {
  try {
    const { model_name } = req.body;

    if (!model_name) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: model_name'
      });
    }

    llmConfig.setTextModel(model_name);

    res.json({
      success: true,
      message: `文本模型已设置为: ${model_name}`,
      data: llmConfig.getTextModel()
    });
  } catch (error) {
    console.error('[configRoutes] 设置文本模型失败:', error);
    res.status(500).json({
      success: false,
      error: '设置文本模型失败',
      message: error.message
    });
  }
});

module.exports = router;
