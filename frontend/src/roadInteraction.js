/**
 * 道路交互层
 *
 * 悬停：直接从 mongo-road-line 图层的 feature 读取标签（零延迟）
 * 点击：直接用渲染的 feature 的 osm_id 查后端拿完整标签 + 增删改查
 *
 * 不再通过坐标查后端——渲染数据就是 MongoDB 数据，feature 上有完整 tags。
 */

import { api } from './api.js';
import { getRoadLabel } from './roadTheme.js';
import { highlightFeature, clearHighlight } from './map.js';

let map = null;
let isRoutePicking = false;

const ROAD_LAYERS = ['mongo-road-line'];

// ── 初始化 ───────────────────────────────────────

export function initRoadInteraction(mapInstance) {
  map = mapInstance;

  const tooltip = document.createElement('div');
  tooltip.id = 'road-tooltip';
  tooltip.className = 'road-tooltip hidden';
  document.body.appendChild(tooltip);

  const hint = document.createElement('div');
  hint.id = 'edit-hint';
  hint.className = 'edit-hint hidden';
  hint.textContent = '🔍 点击查看道路标签';
  document.getElementById('page-map').appendChild(hint);

  map.on('mousemove', onMouseMove);
  map.on('click', onMapClick);
}

export function setRoutePicking(active) { isRoutePicking = active; }

// ── 悬停：直接从渲染的 feature 读标签 ────────────

function onMouseMove(e) {
  if (isRoutePicking) return;

  const tooltip = document.getElementById('road-tooltip');
  const hint = document.getElementById('edit-hint');

  const features = map.queryRenderedFeatures(e.point, { layers: ROAD_LAYERS });

  if (features.length > 0) {
    const f = features[0];
    const props = f.properties;
    const label = getRoadLabel(props);
    const name = props['name:zh'] || props.name || '';
    let text = label;
    if (name) text += ` · ${name}`;
    if (props.surface) text += ` [${props.surface}]`;

    tooltip.textContent = text;
    tooltip.style.left = `${e.point.x + 15}px`;
    tooltip.style.top = `${e.point.y - 10}px`;
    tooltip.classList.remove('hidden');
    hint.classList.remove('hidden');
    map.getCanvas().style.cursor = 'pointer';

    // 高亮
    highlightFeature(f);
  } else {
    tooltip.classList.add('hidden');
    hint.classList.add('hidden');
    map.getCanvas().style.cursor = '';
    clearHighlight();
  }
}

// ── 点击：用 feature 的 osm_id 查后端拿完整标签 ──

async function onMapClick(e) {
  if (isRoutePicking) return;

  const features = map.queryRenderedFeatures(e.point, { layers: ROAD_LAYERS });
  if (features.length === 0) return;

  const f = features[0];
  const osmId = f.properties?.osm_id;
  if (!osmId) return;

  const panel = getOrCreatePanel();
  panel.innerHTML = renderLoading(osmId, f.properties);

  try {
    const result = await api.getRoadTags(osmId);
    if (result.success) {
      panel.innerHTML = renderDetail(osmId, result.data);
      bindDetailEvents(osmId, panel, result.data);
    }
  } catch (err) {
    panel.innerHTML = `<div class="road-panel-error">加载失败: ${err.message}</div>`;
  }
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

function renderLoading(osmId, props) {
  const label = getRoadLabel(props);
  const name = props['name:zh'] || props.name || '';
  return `
    <div class="road-panel-header">
      <h3>🛣️ ${label}${name ? ' · ' + name : ''}</h3>
      <button class="btn-close" onclick="document.getElementById('road-panel').classList.add('hidden')">&times;</button>
    </div>
    <div class="road-panel-body">
      <div style="font-size:12px;color:#8899aa;margin-bottom:8px">osm_id: ${osmId}</div>
      <div class="road-panel-loading">加载完整标签...</div>
    </div>`;
}

function renderDetail(osmId, data) {
  const { original_tags, enhanced_tags, merged_tags, description } = data;

  const renderTags = (tags) => {
    const keys = Object.keys(tags || {});
    if (!keys.length) return '<div class="road-panel-empty">无标签</div>';
    return `<div class="tag-list">${keys.map((k) => `<span class="tag-item"><span class="key">${k}</span><span class="val">${tags[k]}</span></span>`).join('')}</div>`;
  };

  const renderEditable = (tags) => {
    const keys = Object.keys(tags || {});
    if (!keys.length) return '<div class="road-panel-empty">暂无增强标签</div>';
    return `<div class="tag-list">${keys.map((k) =>
      `<span class="tag-item editable"><span class="key">${k}</span><span class="val">${tags[k]}</span><button class="tag-remove" data-key="${k}">&times;</button></span>`
    ).join('')}</div>`;
  };

  return `
    <div class="road-panel-header">
      <h3>🛣️ 道路 #${osmId}</h3>
      <button class="btn-close" onclick="document.getElementById('road-panel').classList.add('hidden')">&times;</button>
    </div>
    <div class="road-panel-body">
      <h4>📋 OSM 原始标签</h4>
      ${renderTags(original_tags)}

      <h4>✏️ 增强标签</h4>
      <div id="road-enhanced-tags">${renderEditable(enhanced_tags)}</div>
      <div class="road-tag-add">
        <input id="road-tag-key" placeholder="标签名 (如 tactile_paving)" />
        <input id="road-tag-value" placeholder="值 (如 yes)" />
        <button id="road-tag-add-btn" class="btn-small">+ 添加</button>
      </div>

      <h4 style="margin-top:12px">📝 描述</h4>
      <textarea id="road-description" class="road-desc-input" rows="2">${description || ''}</textarea>

      <div class="road-panel-actions">
        <button id="road-save-btn" class="btn-primary" style="width:auto;padding:6px 16px">保存</button>
        ${Object.keys(enhanced_tags).length > 0 ? '<button id="road-delete-btn" class="btn-small" style="background:#f85149">删除增强标签</button>' : ''}
      </div>

      <h4 style="margin-top:12px">🔗 合并结果（注入 OSM）</h4>
      ${renderTags(merged_tags)}
    </div>`;
}

// ── 事件绑定 ─────────────────────────────────────

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
      await api.deleteRoadTags(osmId);
      data.enhanced_tags = {};
      data.merged_tags = { ...data.original_tags };
      panel.innerHTML = renderDetail(osmId, data);
      bindDetailEvents(osmId, panel, data);
    });
  }
}
