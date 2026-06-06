/**
 * API 服务模块
 * 封装 HTTP 请求，对接后端
 *
 * 本地开发: vite.config.js 代理 /api -> http://localhost:5741
 * 外网访问: 通过 window.API_BASE_URL 动态设置（如 frp 地址 http://114.132.86.138:5000）
 */

const BASE_URL = typeof window !== 'undefined' && window.API_BASE_URL
  ? window.API_BASE_URL
  : '';

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
 * 获取所有采样点（不分页）
 */
export async function getAllPoints() {
  return request('/api/navigation/points');
}

/**
 * 删除采样点
 */
export async function deletePoint(pointId) {
  return request(`/api/navigation/point/${pointId}`, {
    method: 'DELETE'
  });
}

/**
 * 健康检查（通过 /api 代理）
 */
export async function healthCheck() {
  return request('/api/navigation/stats');
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

/**
 * 获取统计信息
 */
export async function getStats() {
  return request('/api/navigation/stats');
}

export default {
  getActiveLLMConfig,
  getEnvInfo,
  getNearbyPoints,
  getAllPoints,
  deletePoint,
  healthCheck,
  getStats,
  generateNavigationPreview,
  testNavigationPreview,
  previewHealthCheck
};
