/**
 * 路线规划模块
 *
 * 管理起点/终点选择、路线请求、SSE 进度监听
 */

import { api } from './api.js';
import { renderRoute, clearRoute } from './map.js';
import { setRoutePicking } from './roadInteraction.js';
import { escapeHtml } from './utils.js';

const originEl = document.getElementById('route-origin');
const destEl = document.getElementById('route-dest');
const btnRoute = document.getElementById('btn-route');
const routeStatus = document.getElementById('route-status');
const optPreview = document.getElementById('opt-preview');
const optSse = document.getElementById('opt-sse');
const optEngine = document.getElementById('opt-engine');
const sseProgress = document.getElementById('sse-progress');
const sseText = document.getElementById('sse-text');

let origin = null;
let dest = null;
let pickingMode = null; // 'origin' | 'dest'
let isProcessing = false;
let currentSSE = null; // 当前 SSE 连接引用，用于超时清理

export function initRoutePlanner() {
  // 起点/终点点击选择（再次点击同一按钮可取消选择）
  originEl.parentElement.addEventListener('click', () => {
    if (pickingMode === 'origin') {
      cancelPicking();
    } else {
      pickingMode = 'origin';
      originEl.textContent = '请点击地图...';
      setRoutePicking(true);
    }
  });
  destEl.parentElement.addEventListener('click', () => {
    if (pickingMode === 'dest') {
      cancelPicking();
    } else {
      pickingMode = 'dest';
      destEl.textContent = '请点击地图...';
      setRoutePicking(true);
    }
  });

  // ESC 键退出选择模式
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pickingMode) {
      cancelPicking();
    }
  });

  // 开始规划按钮
  btnRoute.addEventListener('click', doRoute);
  updateButton();
}

function cancelPicking() {
  pickingMode = null;
  setRoutePicking(false);
  // 恢复显示已选坐标或默认文本
  originEl.textContent = origin ? `${origin.lng}, ${origin.lat}` : '点击选择起点';
  destEl.textContent = dest ? `${dest.lng}, ${dest.lat}` : '点击选择终点';
}

/**
 * 地图点击回调 — 设置起点或终点
 */
export function onMapClick(lngLat) {
  const point = { lng: Math.round(lngLat.lng * 100000) / 100000, lat: Math.round(lngLat.lat * 100000) / 100000 };
  const label = `${point.lng}, ${point.lat}`;

  if (pickingMode === 'origin') {
    origin = point;
    originEl.textContent = label;
    pickingMode = null;
    setRoutePicking(false);
  } else if (pickingMode === 'dest') {
    dest = point;
    destEl.textContent = label;
    pickingMode = null;
    setRoutePicking(false);
  }

  updateButton();
}

function updateButton() {
  btnRoute.disabled = !origin || !dest || isProcessing;
}

async function doRoute() {
  if (!origin || !dest || isProcessing) return;

  isProcessing = true;
  updateButton();
  routeStatus.textContent = '请求中...';
  clearRoute();

  const enableSse = optSse.checked;
  const enablePreview = optPreview.checked;

  try {
    if (enableSse && enablePreview) {
      await doRouteWithSSE(enablePreview);
    } else {
      await doRouteSync(enablePreview);
    }
  } catch (err) {
    routeStatus.textContent = `错误: ${err.message}`;
  } finally {
    isProcessing = false;
    updateButton();
  }
}

// ── 同步模式 ─────────────────────────────────────

async function doRouteSync(enablePreview) {
  const result = await api.route({
    origin, destination: dest,
    engine: optEngine.value,
    enable_preview: enablePreview,
    enable_sse: false,
  });

  if (!result.success) {
    routeStatus.textContent = result.message || '路线规划失败';
    return;
  }

  renderRouteResult(result.data);
}

// ── SSE 模式 ─────────────────────────────────────

async function doRouteWithSSE(enablePreview) {
  // 1. POST 获取 requestId
  const result = await api.route({
    origin, destination: dest,
    engine: optEngine.value,
    enable_preview: enablePreview,
    enable_sse: true,
  });

  if (!result.success) {
    routeStatus.textContent = result.message || '请求失败';
    return;
  }

  const requestId = result.request_id;
  routeStatus.textContent = '等待 SSE 连接...';

  // 2. 打开 SSE（带超时保护）
  showSseProgress();
  const source = api.sse(requestId);
  currentSSE = source;

  // 超时保护：60 秒无响应则强制关闭
  const SSE_TIMEOUT = 60000;
  let timeoutTimer = setTimeout(() => {
    console.warn('[RoutePlanner] SSE timeout after', SSE_TIMEOUT, 'ms');
    source.close();
    currentSSE = null;
    hideSseProgress();
    routeStatus.textContent = '请求超时，请重试';
    isProcessing = false;
    updateButton();
  }, SSE_TIMEOUT);

  source.onmessage = (e) => {
    clearTimeout(timeoutTimer);
    // 每次收到消息重置超时
    timeoutTimer = setTimeout(() => {
      source.close();
      currentSSE = null;
      hideSseProgress();
      routeStatus.textContent = '请求超时，请重试';
      isProcessing = false;
      updateButton();
    }, SSE_TIMEOUT);

    try {
      const data = JSON.parse(e.data);

      if (data.event === 'connected') {
        sseText.textContent = '已连接，等待处理...';
      } else if (data.event === 'progress') {
        sseText.textContent = data.message || '';
        routeStatus.textContent = data.message || '';
      } else if (data.event === 'done') {
        clearTimeout(timeoutTimer);
        hideSseProgress();
        source.close();
        currentSSE = null;
        if (data.data) renderRouteResult(data.data);
      } else if (data.event === 'error') {
        clearTimeout(timeoutTimer);
        hideSseProgress();
        source.close();
        currentSSE = null;
        routeStatus.textContent = `错误: ${data.message}`;
      } else if (data.event === 'close') {
        clearTimeout(timeoutTimer);
        hideSseProgress();
        source.close();
        currentSSE = null;
      }
    } catch (_) {}
  };

  source.onerror = () => {
    clearTimeout(timeoutTimer);
    hideSseProgress();
    source.close();
    currentSSE = null;
    if (isProcessing) {
      routeStatus.textContent = 'SSE 连接断开';
      isProcessing = false;
      updateButton();
    }
  };
}

// ── 渲染路线结果 ─────────────────────────────────
//
// 分层职责：
//   本函数（编排层）— 解析数据、更新 UI 文字、调用渲染层
//   map.js（渲染层）— 只负责在地图上画路线和标记

function renderRouteResult(data) {
  // 兼容：同步 {route, preview} / SSE {success, data: {route, preview}}
  const payload = data?.data || data;
  if (!payload?.route) {
    routeStatus.textContent = '路线数据异常';
    return;
  }
  const route = payload.route;
  const preview = payload.preview;

  // 1. UI 文字：路线摘要
  routeStatus.textContent = `${(route.distance_m / 1000).toFixed(1)}km · ${Math.round(route.duration_s / 60)}分钟 · ${route.steps.length}步`;

  // 2. 地图渲染：调用 map.js 画路线（编排层 → 渲染层）
  if (route.coords && route.coords.length > 0) {
    renderRoute(route.coords, origin, dest);
  }

  // 3. UI 文字：播报面板
  showBroadcast(preview);
}

/**
 * 显示播报内容（独立面板）
 */
function showBroadcast(preview) {
  const existing = document.getElementById('broadcast-result');
  if (existing) existing.remove();

  if (!preview?.broadcast) return;

  const broadcastEl = document.createElement('div');
  broadcastEl.id = 'broadcast-result';
  broadcastEl.className = 'route-result';
  broadcastEl.innerHTML = `
    <h5>📢 行前预览播报</h5>
    <div class="broadcast">${formatBroadcast(preview.broadcast)}</div>
    ${preview.sample_points ? `<div style="font-size:11px;color:#555;margin-top:6px">采样 ${preview.sample_points} 点 · VLM ${preview.vlm_points} · OSM ${preview.osm_points}</div>` : ''}
  `;
  const routeBox = document.getElementById('route-box');
  routeBox.insertAdjacentElement('afterend', broadcastEl);
}

function formatBroadcast(text) {
  return text
    .replace(/\[SEG\]\s*/g, '\n\n')
    .trim()
    .replace(/\n/g, '<br>');
}

// ── SSE 进度条 UI ────────────────────────────────

function showSseProgress() {
  sseProgress.classList.remove('hidden');
  sseText.textContent = '连接中...';
}

function hideSseProgress() {
  sseProgress.classList.add('hidden');
}
