/**
 * 前端主入口
 * 瞳心引航 - 全链路联调与语音渲染
 */

import { ConfigPanel } from './components/ConfigPanel.js';
import { MapViewer } from './components/MapViewer.js';
import { StreetViewModal } from './components/StreetViewModal.js';
import { PreviewPlayer } from './components/PreviewPlayer.js';
import { MonitorConsole } from './components/MonitorConsole.js';
import { generateNavigationPreview, testNavigationPreview, previewHealthCheck } from './services/api.js';

// 全局状态
window.appState = {
  origin: null,
  destination: null,
  map: null,
  previewPlayer: null
};

// 初始化
async function init() {
  console.log('🚀 初始化...');

  // 初始化面板
  new ConfigPanel('config-panel-container');

  // 初始化地图
  const viewer = new MapViewer('map-viewer');
  window.appState.mapViewer = viewer;

  // 初始化推演播放器
  const previewPlayer = new PreviewPlayer('preview-player-container');
  previewPlayer.init();
  window.appState.previewPlayer = previewPlayer;

  viewer.onReady = (map) => {
    console.log('✅ 地图就绪');
    window.appState.map = map;

    const modal = new StreetViewModal('street-view-modal');
    viewer.onMarkerClick = (p) => modal.open(p);
    viewer.onContextMenu = (lng, lat, px) => showMenu(lng, lat, px, viewer);

    // 初始化监控控制台
    const monitorConsole = new MonitorConsole('monitor-console-modal');
    document.getElementById('monitor-toggle-btn').addEventListener('click', () => {
      monitorConsole.open();
    });
  };

  // 绑定导航测试按钮
  bindNavPreviewButtons();
}

/**
 * 绑定导航推演按钮
 */
function bindNavPreviewButtons() {
  const testBtn = document.getElementById('test-nav-btn');
  const healthBtn = document.getElementById('health-check-btn');
  const generateBtn = document.getElementById('generate-preview-btn');

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      await runNavTest('preset');
    });
  }

  if (healthBtn) {
    healthBtn.addEventListener('click', async () => {
      await checkPreviewHealth();
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      await runNavTest('selected');
    });
  }
}

/**
 * 运行导航推演
 * @param {string} mode - 'preset' 使用预设坐标, 'selected' 使用选中的起终点
 */
async function runNavTest(mode) {
  const loadingEl = document.getElementById('preview-loading');
  const resultEl = document.getElementById('preview-result');
  const errorEl = document.getElementById('preview-error');
  const generateBtn = document.getElementById('generate-preview-btn');

  // 防抖与锁定 - 禁用按钮防止重复点击
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = '推演中...';
  }

  // 重置显示
  loadingEl.classList.remove('hidden');
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  // Phase 5: 更新 Loading 文案，说明长时间等待的原因
  const loadingText = loadingEl.querySelector('.loading-text');
  if (loadingText) {
    loadingText.innerHTML = `
      <div>🧠 正在进行多智能体环境感知推演...</div>
      <div style="font-size: 12px; color: #666; margin-top: 8px;">
        需要调用视觉模型分析街景图片，预计耗时 15-30 秒，请稍候
      </div>
    `;
  }

  try {
    let result;

    if (mode === 'preset') {
      console.log('🧪 测试预设路线...');
      result = await testNavigationPreview();
    } else {
      const { origin, destination } = window.appState;
      if (!origin || !destination) {
        throw new Error('请先设置起点和终点');
      }
      const originStr = `${origin.lng},${origin.lat}`;
      const destStr = `${destination.lng},${destination.lat}`;
      console.log(`🧭 规划路线: ${originStr} -> ${destStr}`);
      result = await generateNavigationPreview(originStr, destStr);
    }

    // Phase 5: 使用 PreviewPlayer 展示结果
    if (window.appState.previewPlayer) {
      window.appState.previewPlayer.show(result.data);
    }

    // Phase 5: 在地图上标记关键节点
    if (window.appState.mapViewer && result.data.key_nodes) {
      window.appState.mapViewer.highlightKeyNodes(result.data.key_nodes);
    }

    // 保留原有显示逻辑作为备份
    displayPreviewResult(result.data);

  } catch (error) {
    console.error('导航测试失败:', error);
    errorEl.textContent = `❌ ${error.message}`;
    errorEl.classList.remove('hidden');
  } finally {
    loadingEl.classList.add('hidden');

    // 恢复按钮
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = '生成推演播报';
    }
  }
}

/**
 * 检查预览服务健康状态
 */
async function checkPreviewHealth() {
  const resultEl = document.getElementById('preview-result');
  const errorEl = document.getElementById('preview-error');

  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  try {
    const result = await previewHealthCheck();
    console.log('健康检查结果:', result);

    if (result.checks.amap_api === 'connected') {
      alert('✅ 高德 API 连接正常\n✅ 中间件算法正常');
    } else {
      alert('❌ 高德 API 连接失败\n请检查 AMAP_WEB_KEY 配置');
    }
  } catch (error) {
    errorEl.textContent = `❌ 健康检查失败: ${error.message}`;
    errorEl.classList.remove('hidden');
  }
}

/**
 * 显示导航预览结果
 */
function displayPreviewResult(data) {
  const resultEl = document.getElementById('preview-result');
  const summaryEl = resultEl.querySelector('.preview-summary');
  const nodesEl = resultEl.querySelector('.preview-nodes');

  // 显示概要
  summaryEl.innerHTML = `
    <div class="summary-item">
      <span class="label">📏 总距离:</span>
      <span class="value">${data.route_summary.total_distance}</span>
    </div>
    <div class="summary-item">
      <span class="label">⏱️ 预计时间:</span>
      <span class="value">${data.route_summary.duration_estimate}</span>
    </div>
    <div class="summary-item">
      <span class="label">🎯 关键节点:</span>
      <span class="value">${data.route_summary.filtered_nodes_count} / ${data.route_summary.original_steps_count}</span>
      <span class="compression">(压缩 ${data.route_summary.compression_ratio})</span>
    </div>
  `;

  // 显示关键节点
  nodesEl.innerHTML = data.key_nodes.map((node, i) => `
    <div class="node-card">
      <div class="node-header">
        <span class="node-index">${node.node_index}</span>
        <span class="node-action">${node.action}</span>
        <span class="node-clock">🕐 ${node.clock_direction}</span>
      </div>
      <div class="node-body">
        <p class="node-instruction">${node.instruction}</p>
        <div class="node-meta">
          <span>📍 ${node.distance_from_start}</span>
          <span>🛣️ ${node.road || '未知道路'}</span>
        </div>
      </div>
    </div>
  `).join('');

  resultEl.classList.remove('hidden');
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showMenu(lng, lat, px, viewer) {
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;left:${px.x}px;top:${px.y}px;background:#fff;border:1px solid #ddd;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:1000;padding:8px 0;`;

  const btn = (text, cb) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'display:block;width:100%;padding:8px 16px;border:none;background:none;cursor:pointer;';
    b.onmouseenter = () => b.style.background = '#f5f5f5';
    b.onmouseleave = () => b.style.background = 'none';
    b.onclick = () => { cb(); menu.remove(); };
    return b;
  };

  menu.appendChild(btn('设为起点', () => {
    window.appState.origin = { lng, lat };
    viewer.setOrigin(lng, lat);
    updateUI();
  }));

  menu.appendChild(btn('设为终点', () => {
    window.appState.destination = { lng, lat };
    viewer.setDestination(lng, lat);
    updateUI();
  }));

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.remove();
  }, { once: true }), 0);
}

function updateUI() {
  const o = window.appState.origin;
  const d = window.appState.destination;

  document.getElementById('origin-value').textContent = o ? `${o.lng.toFixed(6)}, ${o.lat.toFixed(6)}` : '未设置';
  document.getElementById('destination-value').textContent = d ? `${d.lng.toFixed(6)}, ${d.lat.toFixed(6)}` : '未设置';
  document.getElementById('generate-preview-btn').disabled = !(o && d);
}

// 启动
init().catch(console.error);
