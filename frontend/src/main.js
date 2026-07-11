/**
 * CorSight Console — 主入口
 */

import { api } from './api.js';
import { initMap, getMap, renderPoints, switchBaseMap, getCurrentStyle, toggleTraffic } from './map.js';
import { initConsole, installFetchLogger, addTextLog } from './console.js';
import { initDrawTool, startDraw, cancelDraw, loadAnnotations, getAnnotations } from './drawTool.js';
import { startGPSTrigger } from './navigationTrigger.js';

// ── 页面切换 ─────────────────────────────────────

const navLinks = document.querySelectorAll('.nav-links a');
const pages = document.querySelectorAll('.page');

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.dataset.page;
    navLinks.forEach((l) => l.classList.remove('active'));
    link.classList.add('active');
    pages.forEach((p) => p.classList.toggle('active', p.id === `page-${target}`));
  });
});

// ── 初始化 ───────────────────────────────────────

async function init() {
  console.log('CorSight Console starting...');

  installFetchLogger();
  initConsole();

  initMap('map', {});

  // ── 图层切换按钮 ─────────────────────────────
  const layerBtn = document.getElementById('btn-layer-switch');
  if (layerBtn) {
    layerBtn.addEventListener('click', () => {
      const next = getCurrentStyle() === 'satellite' ? 'standard' : 'satellite';
      switchBaseMap(next);
    });
  }

  // ── 路况按钮 ─────────────────────────────────
  const trafficBtn = document.getElementById('btn-traffic');
  if (trafficBtn) {
    trafficBtn.addEventListener('click', () => toggleTraffic());
  }

  const mapInstance = getMap();
  if (mapInstance) {
    const onLoad = () => {
      initDrawTool(mapInstance);
      loadAnnotations();
      addTextLog('地图就绪（高德底图）', 'success');
    };
    mapInstance.isStyleLoaded() ? onLoad() : mapInstance.on('load', onLoad);
  }

  // ── 绘制工具栏 ───────────────────────────────
  const btnPolygon = document.getElementById('btn-draw-polygon');
  const btnLine = document.getElementById('btn-draw-line');
  const btnCancel = document.getElementById('btn-draw-cancel');

  btnPolygon?.addEventListener('click', () => {
    startDraw('polygon', 'damage');
    btnCancel.style.display = 'inline-block';
    btnPolygon.classList.add('active');
    btnLine.classList.remove('active');
  });

  btnLine?.addEventListener('click', (e) => {
    // Shift 吸附：起点自动连接到上一条 Path 的终点
    const snapTo = e.shiftKey ? getLastPathEndpoint() : null;
    startDraw('line', 'damage', { snapTo });
    btnCancel.style.display = 'inline-block';
    btnLine.classList.add('active');
    btnPolygon.classList.remove('active');
  });

  btnCancel?.addEventListener('click', () => {
    cancelDraw();
    btnCancel.style.display = 'none';
    btnPolygon.classList.remove('active');
    btnLine.classList.remove('active');
  });

  await loadPoints();

  // 启动 GPS 自动唤醒（需要用户授权定位）
  startGPSTrigger();

  addTextLog('CorSight Console 就绪', 'success');
}

// ── 加载采样点 ───────────────────────────────────

async function loadPoints() {
  try {
    const result = await api.points();
    if (result.success && result.data) {
      renderPoints(result.data);
      addTextLog(`加载 ${result.data.length} 个采样点`, 'success');
    }
  } catch (err) {
    addTextLog(`加载采样点失败: ${err.message}`, 'error');
  }
}

// ── Shift 吸附辅助 ──────────────────────────────

/**
 * 获取最近一条 Path 的终点坐标，用于 Shift 吸附
 * 优先找 waypoints 最后一个点，否则用 geometry 的最后一个坐标
 */
function getLastPathEndpoint() {
  const list = getAnnotations();
  if (!list || list.length === 0) return null;

  // 倒序找最近一条 Path（LineString 类型）
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const isPath = a.type === 'LineString' || a.type === 'line' || a.node_type === 'path';
    if (!isPath) continue;

    // waypoints 最后一个
    if (a.waypoints?.length > 0) {
      const last = a.waypoints[a.waypoints.length - 1];
      if (last.position?.length === 2) return last.position;
    }

    // geometry 最后一个坐标
    const coords = a.geometry?.coordinates;
    if (coords?.length > 0) {
      const last = coords[coords.length - 1];
      if (Array.isArray(last) && last.length >= 2) return [last[0], last[1]];
    }
  }
  return null;
}

init();
