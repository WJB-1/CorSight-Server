/**
 * API 服务模块 - 已清空，待重新开发
 *
 * 本地开发: vite.config.js 代理 /api -> http://localhost:5741
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

export default {
  request
};
