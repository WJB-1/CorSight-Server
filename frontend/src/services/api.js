/**
 * API 服务模块
 * 封装 HTTP 请求，对接后端 3002 端口
 *
 * 注意: vite.config.js 已配置代理 /api -> http://localhost:3002
 * 所以这里使用相对路径，让请求走 vite 代理
 */

const BASE_URL = '';

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
 */
export async function getActiveLLMConfig() {
  return request('/api/config/llm/active');
}

/**
 * 获取环境变量配置信息
 */
export async function getEnvInfo() {
  return request('/api/config/llm/env-info');
}

/**
 * 获取附近的采样点
 */
export async function getNearbyPoints(lat, lng, radius = 1000) {
  return request(`/api/navigation/nearby?lat=${lat}&lon=${lng}&radius=${radius}`);
}

/**
 * 健康检查
 */
export async function healthCheck() {
  const response = await fetch(`${BASE_URL}/health`);
  return response.json();
}

/**
 * 生成导航预览
 */
export async function generateNavigationPreview(origin, destination) {
  return request('/api/navigation/preview', {
    method: 'POST',
    body: JSON.stringify({ origin, destination })
  });
}

/**
 * 测试导航预览（使用预设坐标）
 */
export async function testNavigationPreview() {
  return request('/api/navigation/preview/test');
}

/**
 * 导航预览服务健康检查
 */
export async function previewHealthCheck() {
  return request('/api/navigation/preview/health');
}

export default {
  getActiveLLMConfig,
  getEnvInfo,
  getNearbyPoints,
  healthCheck,
  generateNavigationPreview,
  testNavigationPreview,
  previewHealthCheck
};
