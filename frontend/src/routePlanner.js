/**
 * 路线规划模块
 *
 * 管理起点/终点选择、路线请求、SSE 进度监听
 */

import { api } from './api.js';
import { renderRoute, clearRoute } from './map.js';

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

export function initRoutePlanner() {
  // 起点/终点点击选择
  originEl.parentElement.addEventListener('click', () => { pickingMode = 'origin'; originEl.textContent = '请点击地图...'; });
  destEl.parentElement.addEventListener('click', () => { pickingMode = 'dest'; destEl.textContent = '请点击地图...'; });

  // 开始规划按钮
  btnRoute.addEventListener('click', doRoute);
  updateButton();
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
  } else if (pickingMode === 'dest') {
    dest = point;
    destEl.textContent = label;
    pickingMode = null;
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

  // 2. 打开 SSE
  showSseProgress();
  const source = api.sse(requestId);

  source.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data.event === 'connected') {
        sseText.textContent = '已连接，等待处理...';
      } else if (data.event === 'progress') {
        sseText.textContent = data.message || '';
        routeStatus.textContent = data.message || '';
      } else if (data.event === 'done') {
        hideSseProgress();
        source.close();
        if (data.data) renderRouteResult(data.data);
      } else if (data.event === 'error') {
        hideSseProgress();
        source.close();
        routeStatus.textContent = `错误: ${data.message}`;
      } else if (data.event === 'close') {
        hideSseProgress();
        source.close();
      }
    } catch (_) {}
  };

  source.onerror = () => {
    hideSseProgress();
    source.close();
    if (isProcessing) {
      routeStatus.textContent = 'SSE 连接断开';
      isProcessing = false;
      updateButton();
    }
  };
}

// ── 渲染路线结果 ─────────────────────────────────

function renderRouteResult(data) {
  const route = data.route;
  const preview = data.preview;

  // 绘制路线到地图
  // 需要坐标，但从 API 返回的 steps 不含 coords
  // 用步骤中的 instruction 拼接信息即可
  routeStatus.textContent = `${(route.distance_m / 1000).toFixed(1)}km · ${Math.round(route.duration_s / 60)}分钟 · ${route.steps.length}步`;

  // 如果有 preview 结果，追加显示
  if (preview?.broadcast) {
    routeStatus.innerHTML += `<div class="route-result"><h5>行前预览播报</h5><div class="broadcast">${formatBroadcast(preview.broadcast)}</div></div>`;
    if (preview.sample_points) {
      routeStatus.innerHTML += `<div style="font-size:11px;color:#555;margin-top:4px">采样${preview.sample_points}点 · VLM ${preview.vlm_points} · OSM ${preview.osm_points}</div>`;
    }
  }
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
