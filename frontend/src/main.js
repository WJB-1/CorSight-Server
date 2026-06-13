/**
 * CorSight Console — 主入口
 *
 * 两个页面：
 * 1. 地图页面：街景节点可视化 + 路线规划测试
 * 2. 控制台页面：实时请求日志
 */

import { api } from './api.js';
import { initMap, renderPoints } from './map.js';
import { initPanel, openPanel, closePanel } from './panel.js';
import { initRoutePlanner, onMapClick } from './routePlanner.js';
import { initConsole, installFetchLogger, addTextLog } from './console.js';

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

  // 1. 安装 fetch 日志拦截
  installFetchLogger();
  initConsole();

  // 2. 初始化地图
  initMap('map', {
    onPointClick: (pointData) => openPanel(pointData),
    onMapClick: (lngLat) => onMapClick(lngLat),
  });

  // 3. 初始化面板和路线规划
  initPanel({
    onImagePreview: showImageModal,
  });
  initRoutePlanner();

  // 4. 加载采样点数据
  await loadPoints();

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

// ── 图片预览弹窗 ────────────────────────────────

function showImageModal(src) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <button class="close-modal">&times;</button>
    <img src="${src}" alt="街景预览">
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('close-modal')) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

// ── 启动 ─────────────────────────────────────────

init();
