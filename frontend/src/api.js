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

  // 通用请求方法
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),

  // 标注
  getAnnotations: (bbox) => {
    const params = bbox
      ? `?west=${bbox.west}&south=${bbox.south}&east=${bbox.east}&north=${bbox.north}`
      : '';
    return request('GET', `/api/annotations${params}`);
  },
  createAnnotation: (data) => request('POST', '/api/annotations', data),
  updateAnnotation: (id, data) => request('PUT', `/api/annotations/${id}`, data),
  deleteAnnotation: (id) => request('DELETE', `/api/annotations/${id}`),
};
