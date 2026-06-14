/**
 * API 客户端
 */

const BASE = window.API_BASE_URL || '';

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

export const api = {
  // 路线规划
  route: (params) => request('POST', '/api/navigation/route', params),

  // 采样点
  points: () => request('GET', '/api/navigation/points'),
  tagStats: () => request('GET', '/api/data/tags/stats'),

  // SSE 连接（路线进度）
  sse(requestId) {
    return new EventSource(`${BASE}/api/sse/stream?requestId=${requestId}`);
  },

  // SSE 连接（日志流）
  logStream() {
    return new EventSource(`${BASE}/api/logs/stream`);
  },
};
