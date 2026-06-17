/**
 * 道路交互层（纯交互，不关心渲染源）
 *
 * 职责：
 * 1. 悬停：高亮最近的道路 + tooltip（从后端查）
 * 2. 点击：查后端 MongoDB 获取真实分段 way → 弹出详情面板
 * 3. 与路线选点互斥
 *
 * 不包含任何渲染逻辑。渲染由 tileRenderer 和 mongoRoadLayer 负责。
 */

import { api } from './api.js';
import { getRoadLabel } from './roadTheme.js';
import { getMap } from './map.js';
import { escapeHtml, createDebounce, createCancellableFetch } from './utils.js';

let map = null;
let isRoutePicking = false;
let hoverDebounce = null; // 延迟初始化，因为 onHoverQuery 在后面声明
const hoverFetch = createCancellableFetch();
const HOVER_DEBOUNCE_MS = 200;

// ── 初始化 ───────────────────────────────────────

export function initRoadInteraction(mapInstance) {
  map = mapInstance;
  hoverDebounce = createDebounce(onHoverQuery, 200);

  // 高亮图层（独立的 GeoJSON source，画在最上层）
  map.addSource('road-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'road-highlight', type: 'line', source: 'road-highlight',
    paint: { 'line-color': '#f39c12', 'line-width': 8, 'line-opacity': 0.8, 'line-blur': 1 },
  });

  // tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'road-tooltip';
  tooltip.className = 'road-tooltip hidden';
  document.body.appendChild(tooltip);

  // 编辑提示
  const hint = document.createElement('div');
  hint.id = 'edit-hint';
  hint.className = 'edit-hint hidden';
  hint.textContent = '🔍 点击查看道路标签';
  document.getElementById('page-map').appendChild(hint);

  map.on('mousemove', onMouseMove);
  map.on('click', onMapClick);
}

export function setRoutePicking(active) { isRoutePicking = active; }

// ── 悬停：查询最近 way + 高亮 ────────────────────

async function onHoverQuery(lng, lat) {
  // 悬停高亮直接用 queryRenderedFeatures 的结果（已在 onMouseMove 中检测到）
  // 不需要查后端——悬停只需要视觉反馈，点击时才查完整标签
}

async function onMouseMove(e) {
  if (isRoutePicking) return;

  const tooltip = document.getElementById('road-tooltip');
  const hint = document.getElementById('edit-hint');
  const lng = e.lngLat.lng;
  const lat = e.lngLat.lat;

  // 扩大检测范围：鼠标周围 15px 的矩形区域，提高道路命中率
  const buffer = 15;
  const sw = [e.point.x - buffer, e.point.y + buffer];
  const ne = [e.point.x + buffer, e.point.y - buffer];
  const features = map.queryRenderedFeatures([sw, ne], {
    layers: getQueryableLayerIds(),
  });

  if (features.length > 0) {
    const f = features[0];
    const roadLabel = getRoadLabel(f.properties);
    const name = f.properties?.['name:zh'] || f.properties?.name || '';
    let text = roadLabel;
    if (name) text += ` · ${name}`;

    tooltip.textContent = text;
    tooltip.style.left = `${e.x + 15}px`;
    tooltip.style.top = `${e.y - 10}px`;
    tooltip.classList.remove('hidden');
    hint.classList.remove('hidden');
    map.getCanvas().style.cursor = 'pointer';

    // 高亮：直接用瓦片检测到的几何（零延迟，不需要查后端）
    if (map.getSource('road-highlight')) {
      map.getSource('road-highlight').setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: f.geometry, properties: {} }],
      });
    }
  } else {
    tooltip.classList.add('hidden');
    hint.classList.add('hidden');
    map.getCanvas().style.cursor = '';
    clearHighlight();
  }
}

// ── 点击：精确查询坐标所在道路 ────────────────────

async function onMapClick(e) {
  if (isRoutePicking) return;

  const lng = e.lngLat.lng;
  const lat = e.lngLat.lat;

  const tooltip = document.getElementById('road-tooltip');
  if (tooltip) tooltip.classList.add('hidden');

  const panel = getOrCreatePanel();
  panel.innerHTML = renderLoading(lng, lat);

  try {
    const result = await api.getWayAt(lng, lat);
    if (result.success && result.data) {
      // 直接显示该道路的详情面板
      const osmId = result.data.osm_id;
      const detailResult = await api.getRoadTags(osmId);
      if (detailResult.success) {
        panel.innerHTML = renderDetail(osmId, detailResult.data);
        bindPanelClose(panel);
        bindDetailEvents(osmId, panel, detailResult.data);
      }
    } else {
      panel.innerHTML = renderEmpty(lng, lat);
      bindPanelClose(panel);
    }
  } catch (err) {
    panel.innerHTML = `<div class="road-panel-header"><h3>错误</h3><button class="btn-close js-panel-close">&times;</button></div><div class="road-panel-body"><div class="road-panel-error">${escapeHtml(err.message)}</div></div>`;
    bindPanelClose(panel);
  }
}

// ── 高亮 ─────────────────────────────────────────

async function highlightWay(osmId) {
  if (!map?.getSource('mongo-roads')) {
    // 瓦片模式：通过 API 获取道路几何并高亮
    try {
      const res = await fetch(`/api/road/${osmId}`);
      if (!res.ok) return;
      const result = await res.json();
      if (result.success && result.data?.geometry) {
        const feature = {
          type: 'Feature',
          geometry: result.data.geometry,
          properties: { osm_id: osmId },
        };
        if (map.getSource('road-highlight')) {
          map.getSource('road-highlight').setData({ type: 'FeatureCollection', features: [feature] });
        }
      }
    } catch (_) {}
    return;
  }

  // MongoDB 模式：从已加载的 GeoJSON 中找 feature 高亮
  const source = map.getSource('mongo-roads');
  const data = source?._data;
  if (!data?.features) return;

  const feature = data.features.find((f) => f.properties?.osm_id === osmId);
  if (feature && map.getSource('road-highlight')) {
    map.getSource('road-highlight').setData({ type: 'FeatureCollection', features: [feature] });
  }
}

function clearHighlight() {
  if (map?.getSource('road-highlight')) {
    map.getSource('road-highlight').setData({ type: 'FeatureCollection', features: [] });
  }
}

// ── 获取当前可用的查询图层 ───────────────────────

function getQueryableLayerIds() {
  const layers = [];
  // 瓦片图层
  const tileLayers = ['road-motorway', 'road-primary', 'road-secondary', 'road-minor',
    'road-footway', 'road-pedestrian', 'road-platform', 'road-cycleway', 'road-path-other',
    'road-steps', 'road-transit'];
  for (const id of tileLayers) {
    if (map.getLayer(id)) layers.push(id);
  }
  // MongoDB 图层
  if (map.getLayer('mongo-road-line')) layers.push('mongo-road-line');
  return layers;
}

// ── 面板 ─────────────────────────────────────────

function getOrCreatePanel() {
  let panel = document.getElementById('road-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'road-panel';
    panel.className = 'road-panel';
    document.getElementById('page-map').appendChild(panel);
  }
  panel.classList.remove('hidden');
  return panel;
}

function renderLoading(lng, lat) {
  return `<div class="road-panel-header"><h3>🛣️ 查询中...</h3><button class="btn-close js-panel-close">&times;</button></div>
    <div class="road-panel-body"><div style="font-size:12px;color:#8899aa">坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}</div><div class="road-panel-loading">查询附近的分段道路...</div></div>`;
}

function renderEmpty(lng, lat) {
  return `<div class="road-panel-header"><h3>🛣️ 无结果</h3><button class="btn-close js-panel-close">&times;</button></div>
    <div class="road-panel-body"><div style="font-size:12px;color:#8899aa">坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}<br>附近 15m 内未找到道路</div></div>`;
}

function bindPanelClose(panel) {
  const btn = panel.querySelector('.js-panel-close');
  if (btn) btn.addEventListener('click', () => panel.classList.add('hidden'));
}

function renderWayList(ways, lng, lat) {
  let html = `<div class="road-panel-header"><h3>🛣️ 附近道路</h3><button class="btn-close js-panel-close">&times;</button></div>
    <div class="road-panel-body">
    <div style="font-size:12px;color:#8899aa;margin-bottom:8px">坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)} · ${ways.length} 条</div>`;

  for (const way of ways) {
    const label = getRoadLabel(way.tags);
    const name = way.tags?.['name:zh'] || way.tags?.name || '';
    const isSeg = !!way.parent_way;
    html += `<div class="road-way-card" data-osm-id="${way.osm_id}">
      <div class="road-way-header">
        <span class="road-way-label">${escapeHtml(label)}</span>
        ${name ? `<span style="margin-left:6px">${escapeHtml(name)}</span>` : ''}
        ${isSeg ? '<span class="road-segment-badge">分段</span>' : ''}
      </div>
      <div style="font-size:11px;color:#555">osm_id: ${way.osm_id}${way.parent_way ? ` (parent: ${way.parent_way})` : ''}</div>
      <div class="road-way-actions"><button class="btn-small road-detail-btn" data-osm-id="${way.osm_id}">查看详情</button></div>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderDetail(osmId, data) {
  const { original_tags, enhanced_tags, merged_tags, description } = data;
  const renderTags = (tags) => {
    const keys = Object.keys(tags || {});
    if (!keys.length) return '<div class="road-panel-empty">无标签</div>';
    return `<div class="tag-list">${keys.map((k) => `<span class="tag-item"><span class="key">${escapeHtml(k)}</span><span class="val">${escapeHtml(tags[k])}</span></span>`).join('')}</div>`;
  };
  const renderEditable = (tags) => {
    const keys = Object.keys(tags || {});
    if (!keys.length) return '<div class="road-panel-empty">暂无增强标签</div>';
    return `<div class="tag-list">${keys.map((k) => `<span class="tag-item editable"><span class="key">${escapeHtml(k)}</span><span class="val">${escapeHtml(tags[k])}</span><button class="tag-remove" data-key="${escapeHtml(k)}">&times;</button></span>`).join('')}</div>`;
  };

  return `<div class="road-panel-header"><h3>🛣️ 道路 #${osmId}</h3><button class="btn-close js-panel-close">&times;</button></div>
    <div class="road-panel-body">
    <h4>📋 OSM 原始标签</h4>${renderTags(original_tags)}
    <h4>✏️ 增强标签</h4><div id="road-enhanced-tags">${renderEditable(enhanced_tags)}</div>
    <div class="road-tag-add"><input id="road-tag-key" placeholder="标签名"/><input id="road-tag-value" placeholder="值"/><button id="road-tag-add-btn" class="btn-small">+ 添加</button></div>
    <h4 style="margin-top:12px">📝 描述</h4><textarea id="road-description" class="road-desc-input" rows="2">${escapeHtml(description || '')}</textarea>
    <div class="road-panel-actions">
      <button id="road-save-btn" class="btn-primary" style="width:auto;padding:6px 16px">保存</button>
      ${Object.keys(enhanced_tags).length > 0 ? '<button id="road-delete-btn" class="btn-small" style="background:#f85149">删除增强标签</button>' : ''}
      <button id="road-back-btn" class="btn-small">← 返回列表</button>
    </div>
    <h4 style="margin-top:12px">🔗 合并结果</h4>${renderTags(merged_tags)}
    </div>`;
}

// ── 事件绑定 ─────────────────────────────────────

function bindListEvents(panel, ways) {
  panel.querySelectorAll('.road-detail-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const osmId = parseInt(btn.dataset.osmId, 10);
      panel.innerHTML = '<div class="road-panel-header"><h3>加载中...</h3></div>';
      try {
        const result = await api.getRoadTags(osmId);
        if (result.success) {
          panel.innerHTML = renderDetail(osmId, result.data);
          bindDetailEvents(osmId, panel, result.data);
        }
      } catch (err) {
        panel.innerHTML = `<div class="road-panel-error">${err.message}</div>`;
      }
    });
  });
}

function bindDetailEvents(osmId, panel, data) {
  const addBtn = panel.querySelector('#road-tag-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const key = panel.querySelector('#road-tag-key').value.trim();
      const val = panel.querySelector('#road-tag-value').value.trim();
      if (!key) return;
      data.enhanced_tags[key] = val;
      data.merged_tags[key] = val;
      panel.innerHTML = renderDetail(osmId, data);
      bindDetailEvents(osmId, panel, data);
    });
  }

  panel.querySelectorAll('.tag-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      delete data.enhanced_tags[key];
      delete data.merged_tags[key];
      panel.innerHTML = renderDetail(osmId, data);
      bindDetailEvents(osmId, panel, data);
    });
  });

  const saveBtn = panel.querySelector('#road-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const desc = panel.querySelector('#road-description')?.value || '';
      try {
        await api.updateRoadTags(osmId, data.enhanced_tags, desc);
        saveBtn.textContent = '✓ 已保存';
        saveBtn.disabled = true;
        setTimeout(() => { saveBtn.textContent = '保存'; saveBtn.disabled = false; }, 2000);
      } catch (err) { alert('保存失败: ' + err.message); }
    });
  }

  const deleteBtn = panel.querySelector('#road-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('确认删除所有增强标签？')) return;
      try {
        await api.deleteRoadTags(osmId);
        data.enhanced_tags = {};
        data.merged_tags = { ...data.original_tags };
        panel.innerHTML = renderDetail(osmId, data);
        bindDetailEvents(osmId, panel, data);
      } catch (err) {
        alert('删除失败: ' + err.message);
      }
    });
  }
}
