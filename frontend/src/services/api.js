/**
 * API 服务模块
 * 封装 HTTP 请求，对接后端 3002 端口
 *
 * 注意: vite.config.js 已配置代理 /api -> http://localhost:3002
 * 所以这里使用相对路径，让请求走 vite 代理
 */

const BASE_URL = '';  // 使用相对路径，走 vite 代理

/**
 * 基础请求函数
 * @param {string} url - 请求路径
 * @param {Object} options - 请求选项
 * @returns {Promise<any>}
 */
async function request(url, options = {}) {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }

  return data;
}

/**
 * 获取当前激活的 LLM 配置
 * @returns {Promise<Object>}
 */
export async function getActiveLLMConfig() {
  return request('/api/config/llm/active');
}


/**
 * 获取可用的 LLM 模型列表
 * @returns {Promise<Object>}
 */
export async function getAvailableModels() {
  return request('/api/config/llm/models');
}

/**
 * 获取附近的采样点
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @param {number} radius - 搜索半径（米），默认 1000
 * @returns {Promise<Object>}
 */
export async function getNearbyPoints(lat, lng, radius = 1000) {
  return request(`/api/navigation/nearby?lat=${lat}&lon=${lng}&radius=${radius}`);
}

/**
 * 健康检查
 * @returns {Promise<Object>}
 */
export async function healthCheck() {
  const response = await fetch(`${BASE_URL}/health`);
  return response.json();
}

/**
 * 生成导航预览（Phase 3）
 * @param {string} origin - 起点坐标 "lng,lat"
 * @param {string} destination - 终点坐标 "lng,lat"
 * @returns {Promise<Object>} 中间表示 (IR) 数据
 */
export async function generateNavigationPreview(origin, destination) {
  return request('/api/navigation/preview', {
    method: 'POST',
    body: JSON.stringify({ origin, destination })
  });
}

/**
 * 测试导航预览（使用预设坐标）
 * @returns {Promise<Object>}
 */
export async function testNavigationPreview() {
  return request('/api/navigation/preview/test');
}

/**
 * 导航预览服务健康检查
 * @returns {Promise<Object>}
 */
export async function previewHealthCheck() {
  return request('/api/navigation/preview/health');
}

/**
 * 获取环境变量配置信息
 * @returns {Promise<Object>}
 */
export async function getEnvInfo() {
  return request('/api/config/llm/env-info');
}

/**
 * 探测 LLM 模型可用性
 * @returns {Promise<Object>}
 */
export async function probeLLMModels() {
  return request('/api/config/llm/probe');
}

/**
 * 简化版保存 LLM 配置（Phase 4 补充，不再发送 api_key）
 * @param {string} provider - 提供商
 * @param {string} modelName - 模型名称
 * @returns {Promise<Object>}
 */
export async function saveLLMConfig(provider, modelName) {
  return request('/api/config/llm', {
    method: 'POST',
    body: JSON.stringify({
      provider,
      model_name: modelName
    })
  });
}

/**
 * 获取分类后的模型列表（视觉模型 vs 文本模型）
 * @returns {Promise<Object>} { vision: [...], text: [...] }
 */
export async function getClassifiedModels() {
  return request('/api/config/llm/models/classified');
}

/**
 * 保存视觉模型配置
 * @param {string} modelName - 模型名称
 */
export async function saveVisionModel(modelName) {
  return request('/api/config/llm/models/vision', {
    method: 'POST',
    body: JSON.stringify({ model_name: modelName })
  });
}

/**
 * 保存文本模型配置
 * @param {string} modelName - 模型名称
 */
export async function saveTextModel(modelName) {
  return request('/api/config/llm/models/text', {
    method: 'POST',
    body: JSON.stringify({ model_name: modelName })
  });
}

export default {
  getActiveLLMConfig,
  saveLLMConfig,
  getAvailableModels,
  getClassifiedModels,
  saveVisionModel,
  saveTextModel,
  getNearbyPoints,
  healthCheck,
  generateNavigationPreview,
  testNavigationPreview,
  previewHealthCheck,
  getEnvInfo,
  probeLLMModels
};