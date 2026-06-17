/**
 * CorSight Console — 主入口
 */

import { api } from './api.js';
import { initMap, getMap, renderPoints } from './map.js';
import { initPanel, openPanel } from './panel.js';
import { initRoutePlanner, onMapClick } from './routePlanner.js';
import { initConsole, installFetchLogger, addTextLog } from './console.js';
import { runCoordDebug, initDebugToggle } from './debugCoord.js';
import { initTileRenderer, toggleTileRenderer } from './tileRenderer.js';
import { initRoadInteraction } from './roadInteraction.js';
import { escapeAttr } from './utils.js';

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

  // 1. 初始化地图（包含瓦片底图 + 业务图层）
  initMap('map', {
    onPointClick: (pointData) => openPanel(pointData),
    onMapClick: (lngLat) => onMapClick(lngLat),
  });

  initPanel({ onImagePreview: showImageModal });
  initRoutePlanner();
  initDebugToggle();

  // 2. 地图 load 完成后初始化渲染层 + 交互层
  const mapInstance = getMap();
  if (mapInstance) {
    const initAfterLoad = () => {
      initTileRenderer();
      initRoadInteraction(mapInstance);
      addTextLog('地图就绪', 'success');

      const tileToggle = document.getElementById('toggle-tile-layer');
      if (tileToggle) {
        tileToggle.checked = true;
        tileToggle.addEventListener('change', () => {
          const on = toggleTileRenderer();
          addTextLog(`瓦片图层: ${on ? '开' : '关'}`, 'info');
        });
      }
    };

    if (mapInstance.isStyleLoaded()) {
      initAfterLoad();
    } else {
      mapInstance.on('load', initAfterLoad);
    }
  }

  // 3. 加载采样点
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
      runCoordDebug(result.data);
    }
  } catch (err) {
    addTextLog(`加载采样点失败: ${err.message}`, 'error');
  }
}

// ── 图片预览弹窗 ────────────────────────────────

function showImageModal(src) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<button class="close-modal">&times;</button><img src="${escapeAttr(src)}" alt="街景预览">`;

  // 点击关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('close-modal')) {
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }
  });

  // ESC 键关闭（视障导航项目，键盘可访问性尤为重要）
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onEsc);
    }
  };
  document.addEventListener('keydown', onEsc);

  document.body.appendChild(overlay);
}

init();
