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

  // 检查 HTTP 状态码
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (e) {
      // 非 JSON 响应，使用状态码
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

export const api = {
  // 路线规划
  route: (params) => request('POST', '/api/navigation/route', params),

  // 采样点
  points: () => request('GET', '/api/navigation/points'),
  tagStats: () => request('GET', '/api/data/tags/stats'),

  // 道路标签
  getRoadGeoJSON: (minLng, minLat, maxLng, maxLat, limit) => request('GET', `/api/road/geojson?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}&limit=${limit || 5000}`),
  getWayAt: (lng, lat) => request('GET', `/api/road/at?lng=${lng}&lat=${lat}`),
  getRoadTags: (osmId) => request('GET', `/api/road/${osmId}`),
  updateRoadTags: (osmId, tags, description) => request('POST', `/api/road/${osmId}`, { tags, description }),
  deleteRoadTags: (osmId) => request('DELETE', `/api/road/${osmId}`),

  // SSE 连接（路线进度）
  sse(requestId) {
    return new EventSource(`${BASE}/api/sse/stream?requestId=${requestId}`);
  },

  // SSE 连接（日志流）
  logStream() {
    return new EventSource(`${BASE}/api/logs/stream`);
  },
};
