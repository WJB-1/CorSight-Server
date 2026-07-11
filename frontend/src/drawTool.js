/**
 * 地图绘制工具
 *
 * 基于 MapLibre GL GeoJSON 图层实现多边形/线条绘制预览。
 * 用 source + layer 而非 Canvas，保证坐标与地图完全一致。
 */

import { api } from './api.js';

let map = null;

// ── 状态 ─────────────────────────────────────────
let drawing = false;
let drawType = 'polygon';
let points = [];
let annotations = [];
let annotationSources = {};
let shiftSnap = false;       // Shift 吸附：起点自动连接到上一条 Path 的终点
let snapPoint = null;        // 吸附目标坐标 [lng, lat]

// ── 分类配置 ─────────────────────────────────────
const CATEGORIES = {
  damage:      { label: '路面损坏', color: '#e63946', fill: 'rgba(231, 57, 70, 0.3)' },
  obstacle:    { label: '障碍物',   color: '#f39c12', fill: 'rgba(243, 156, 18, 0.3)' },
  construction:{ label: '施工区域', color: '#e9c46a', fill: 'rgba(233, 196, 106, 0.3)' },
  flood:       { label: '积水',     color: '#118ab2', fill: 'rgba(17, 138, 178, 0.3)' },
  danger:      { label: '危险区域', color: '#ff0000', fill: 'rgba(255, 0, 0, 0.3)' },
  other:       { label: '其他',     color: '#6c757d', fill: 'rgba(108, 117, 125, 0.3)' },
};

const DRAW_SRC = 'draw-preview';
const DRAW_LINE_ID = 'draw-preview-line';
const DRAW_FILL_ID = 'draw-preview-fill';
const DRAW_POINTS_ID = 'draw-preview-points';
const DRAW_MOUSE_ID = 'draw-preview-mouse';

let selectedCategory = 'damage';

// ── 初始化 ───────────────────────────────────────

export function initDrawTool(mapInstance) {
  map = mapInstance;

  // 创建绘制预览 source（GeoJSON）
  map.addSource(DRAW_SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // 多边形的填充
  map.addLayer({
    id: DRAW_FILL_ID, type: 'fill', source: DRAW_SRC,
    paint: { 'fill-color': '#e63946', 'fill-opacity': 0.3 },
    filter: ['==', '$type', 'Polygon'],
  });

  // 多边形的边框 / 线条
  map.addLayer({
    id: DRAW_LINE_ID, type: 'line', source: DRAW_SRC,
    paint: { 'line-color': '#e63946', 'line-width': 2.5, 'line-opacity': 0.9 },
  });

  // 顶点圆点
  map.addLayer({
    id: DRAW_POINTS_ID, type: 'circle', source: DRAW_SRC,
    paint: { 'circle-radius': 5, 'circle-color': '#e63946', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    filter: ['==', '$type', 'Point'],
  });

  map.on('click', onMapClick);
  map.on('dblclick', onDblClick);
  map.on('contextmenu', onContextMenu);
  map.on('mousemove', onMouseMove);

  // 创建详情面板
  createInfoPanel();
}

// ── 加载已有标注 ─────────────────────────────────

export async function loadAnnotations() {
  if (!map) return;
  const bounds = map.getBounds();
  try {
    const res = await api.get(
      `/api/annotations?west=${bounds.getWest()}&south=${bounds.getSouth()}&east=${bounds.getEast()}&north=${bounds.getNorth()}`
    );
    if (res.success && res.data) {
      renderStoredAnnotations(res.data);
    }
  } catch (err) {
    console.warn('[DrawTool] Load failed:', err.message);
  }
}

function renderStoredAnnotations(list) {
  for (const id of Object.keys(annotationSources)) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }
  annotationSources = {};

  // 收集所有图层 ID 用于悬停/点击（更新模块级变量）
  _annotationLayerIds = [];

  // 更新模块级数据
  annotations = list;
  _annotationLayerIds = [];

  list.forEach((a, i) => {
    const sid = `as-${i}`;
    const lid = `al-${i}`;
    const cfg = CATEGORIES[a.category] || CATEGORIES.other;
    // 兼容大小写
    const isPoly = a.type === 'Polygon' || a.type === 'polygon';

    map.addSource(sid, {
      type: 'geojson',
      data: { type: 'Feature', geometry: a.geometry, properties: { _nodeIndex: i } },
    });

    if (isPoly) {
      map.addLayer({ id: lid, type: 'fill', source: sid, paint: { 'fill-color': cfg.color, 'fill-opacity': 0.35 } });
      map.addLayer({ id: `${lid}-o`, type: 'line', source: sid, paint: { 'line-color': cfg.color, 'line-width': 2.5 } });
      annotationSources[`${lid}-o`] = true;
      _annotationLayerIds.push(lid, `${lid}-o`);
    } else {
      map.addLayer({ id: `${lid}-hit`, type: 'line', source: sid, paint: { 'line-color': 'transparent', 'line-width': 16 } });
      map.addLayer({ id: lid, type: 'line', source: sid, paint: { 'line-color': cfg.color, 'line-width': 3, 'line-dasharray': [6, 3] } });
      annotationSources[`${lid}-hit`] = true;
      _annotationLayerIds.push(`${lid}-hit`, lid);
    }
    annotationSources[lid] = true;
    annotationSources[sid] = true;

    if (a.label) {
      const lpt = labelPoint(a.geometry);
      if (lpt) {
        const lsid = `als-${i}`;
        const llid = `all-${i}`;
        map.addSource(lsid, { type: 'geojson', data: { type: 'Feature', geometry: lpt, properties: { label: a.label } } });
        map.addLayer({ id: llid, type: 'symbol', source: lsid, layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': cfg.color, 'text-halo-color': '#fff', 'text-halo-width': 2 } });
        annotationSources[llid] = true;
        annotationSources[lsid] = true;
      }
    }
  });

  // ── 绑定悬停光标 ──────────────────────
  _annotationLayerIds.forEach((lid) => {
    map.off('mouseenter', lid, onAnnotationHoverIn);
    map.off('mouseleave', lid, onAnnotationHoverOut);
    map.on('mouseenter', lid, onAnnotationHoverIn);
    map.on('mouseleave', lid, onAnnotationHoverOut);
  });

  // ── 重新绑定点击 ──────────────────────
  map.off('click', onAnnotationClick);
  map.on('click', onAnnotationClick);
}

// 保存当前标注图层 ID 列表供点击查询
let _annotationLayerIds = [];

function onAnnotationHoverIn() {
  if (drawing) return;
  map.getCanvas().style.cursor = 'pointer';
}

function onAnnotationHoverOut() {
  if (drawing) return;
  map.getCanvas().style.cursor = '';
}

function labelPoint(geom) {
  try {
    const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates;
    if (!coords || coords.length === 0) return null;
    return { type: 'Point', coordinates: coords[Math.floor(coords.length / 2)] };
  } catch { return null; }
}

// ── 开始 / 取消 ─────────────────────────────────

/**
 * 开始绘制
 * @param {string} type — 'polygon' | 'line'
 * @param {string} category — 分类
 * @param {object} opts — { snapTo: [lng, lat] } 吸附到指定坐标
 */
export function startDraw(type, category, opts = {}) {
  if (!map || drawing) return;
  drawing = true;
  drawType = type;
  selectedCategory = category || 'damage';
  shiftSnap = !!opts.snapTo;
  snapPoint = opts.snapTo || null;
  points = [];

  // 如果吸附，第一个点自动设为吸附目标
  if (snapPoint) {
    points.push([snapPoint[0], snapPoint[1]]);
    console.log('[DrawTool] Shift-snapped to:', snapPoint);
  }

  clearPreview();
  updatePreviewStyles();
  map.getCanvas().style.cursor = shiftSnap ? 'cell' : 'crosshair';
  map.dragPan.disable();
  console.log('[DrawTool] Started', type, shiftSnap ? '(snapped)' : '');
}

export function cancelDraw() {
  drawing = false;
  points = [];
  clearPreview();
  map.getCanvas().style.cursor = '';
  map.dragPan.enable();
  updateUI();
  console.log('[DrawTool] Cancelled');
}

// ── 更新预览图层样式（按分类变色） ─────────────

function updatePreviewStyles() {
  const cfg = CATEGORIES[selectedCategory];
  if (map.getLayer(DRAW_FILL_ID)) map.setPaintProperty(DRAW_FILL_ID, 'fill-color', cfg.color);
  if (map.getLayer(DRAW_LINE_ID)) map.setPaintProperty(DRAW_LINE_ID, 'line-color', cfg.color);
  if (map.getLayer(DRAW_POINTS_ID)) {
    map.setPaintProperty(DRAW_POINTS_ID, 'circle-color', cfg.color);
  }
}

function clearPreview() {
  if (map?.getSource(DRAW_SRC)) {
    map.getSource(DRAW_SRC).setData({ type: 'FeatureCollection', features: [] });
  }
}

// ── 事件处理 ─────────────────────────────────────

// 吸附阈值：距离起点小于此像素数时自动闭合
const SNAP_PX = 15;

function onMapClick(e) {
  if (!drawing) return;

  // 多边形绘制：检查是否靠近起点，自动闭合
  if (drawType === 'polygon' && points.length >= 3) {
    const startPx = map.project(points[0]);
    const clickPx = map.project([e.lngLat.lng, e.lngLat.lat]);
    const dist = Math.hypot(clickPx.x - startPx.x, clickPx.y - startPx.y);

    if (dist <= SNAP_PX) {
      console.log('[DrawTool] Snapped to start, closing polygon');
      finishDraw();
      return;
    }
  }

  points.push([e.lngLat.lng, e.lngLat.lat]);
  console.log('[DrawTool] Point:', points.length);
  updatePreview(e);
}

function onMouseMove(e) {
  if (!drawing || points.length === 0) return;

  // 多边形绘制：检查鼠标是否靠近起点，改变起点样式提示可闭合
  if (drawType === 'polygon' && map.getLayer(DRAW_POINTS_ID)) {
    const startPx = map.project(points[0]);
    const mousePx = map.project([e.lngLat.lng, e.lngLat.lat]);
    const dist = Math.hypot(mousePx.x - startPx.x, mousePx.y - startPx.y);
    const near = dist <= SNAP_PX;

    map.setPaintProperty(DRAW_POINTS_ID, 'circle-radius', [
      'case',
      ['==', ['get', 'isStart'], true], near ? 8 : 5,
      5,
    ]);
    map.setPaintProperty(DRAW_POINTS_ID, 'circle-stroke-color', [
      'case',
      ['==', ['get', 'isStart'], true], near ? '#ffcc00' : '#fff',
      '#fff',
    ]);
    map.getCanvas().style.cursor = near ? 'pointer' : 'crosshair';
  }

  updatePreview(e);
}

function onDblClick(e) {
  if (!drawing || drawType !== 'polygon' || points.length < 3) return;
  console.log('[DrawTool] DblClick finish');
  finishDraw();
}

function onContextMenu(e) {
  if (!drawing) return;
  e.originalEvent?.preventDefault?.();
  const ok = (drawType === 'polygon' && points.length >= 3) || (drawType === 'line' && points.length >= 2);
  if (ok) {
    console.log('[DrawTool] RightClick finish');
    finishDraw();
  }
}

// ── 预览更新 ─────────────────────────────────────

function updatePreview(mouseEvent) {
  if (!map?.getSource(DRAW_SRC)) return;

  const features = [];

  // 多边形填充 + 轮廓
  if (drawType === 'polygon' && points.length >= 2) {
    // 当前路径（连到鼠标）
    const ring = mouseEvent
      ? [...points, [mouseEvent.lngLat.lng, mouseEvent.lngLat.lat]]
      : points;
    // 闭合
    if (ring.length >= 3 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
      ring.push([...ring[0]]);
    }
    if (ring.length >= 4) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      });
    }
  }

  // 线条 / 多边形边框路径
  if (points.length >= 2) {
    const lineCoords = mouseEvent
      ? [...points, [mouseEvent.lngLat.lng, mouseEvent.lngLat.lat]]
      : points;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lineCoords },
      properties: {},
    });
  }

  // 顶点圆点（起点标记 isStart=true，用于吸附高亮）
  for (let i = 0; i < points.length; i++) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: points[i] },
      properties: { isStart: i === 0 },
    });
  }

  map.getSource(DRAW_SRC).setData({ type: 'FeatureCollection', features });
}

// ── 完成 → 保存 ─────────────────────────────────

async function finishDraw() {
  const minCount = drawType === 'polygon' ? 3 : 2;
  if (points.length < minCount) {
    cancelDraw();
    return;
  }

  const coords = drawType === 'polygon'
    ? [[...points, [...points[0]]]]
    : points;

  const geomType = drawType === 'polygon' ? 'Polygon' : 'LineString';

  // 重置
  map.getCanvas().style.cursor = '';
  map.dragPan.enable();
  drawing = false;
  const savedPoints = [...points];
  points = [];
  clearPreview();
  updateUI();

  const label = prompt('标注名称（可选）：', '') || '';

  try {
    const nodeType = drawType === 'polygon' ? 'poi' : 'path';

    const res = await api.post('/api/annotations', {
      node_type: nodeType,
      type: drawType === 'polygon' ? 'Polygon' : 'LineString',
      geometry: { type: geomType, coordinates: coords },
      category: 'heritage',
      label,
      zoom: map.getZoom(),
    });
    if (res.success) {
      console.log('[DrawTool] Saved');
      loadAnnotations();
    }
  } catch (err) {
    console.error('[DrawTool] Save failed:', err.message);
    alert('保存失败: ' + err.message);
  }
}

function updateUI() {
  const btnPolygon = document.getElementById('btn-draw-polygon');
  const btnLine = document.getElementById('btn-draw-line');
  const btnCancel = document.getElementById('btn-draw-cancel');

  if (btnCancel) btnCancel.style.display = drawing ? 'inline-block' : 'none';
  if (!drawing) {
    btnPolygon?.classList.remove('active');
    btnLine?.classList.remove('active');
  }
}

// ── 标注点击 → 详情面板 ──────────────────────────

// 收集所有可点击的标注图层 ID
function getAnnotationLayerIds() {
  const ids = [];
  for (const key of Object.keys(annotationSources)) {
    if (key.startsWith('al-') || key.endsWith('-hit')) ids.push(key);
  }
  return ids;
}

function onAnnotationClick(e) {
  if (drawing) return;
  if (_annotationLayerIds.length === 0) return;

  const features = map.queryRenderedFeatures(e.point, { layers: _annotationLayerIds });
  if (features.length === 0) { hideInfoPanel(); return; }

  // 命中标注，阻止事件继续传播到地图
  e.originalEvent?.stopPropagation?.();

  const idx = features[0].properties._nodeIndex;
  if (idx === undefined || !annotations || !annotations[idx]) { hideInfoPanel(); return; }

  showInfoPanel(annotations[idx]);
}

// ── 详情面板 DOM ─────────────────────────────────

let infoPanel = null;

function createInfoPanel() {
  infoPanel = document.createElement('div');
  infoPanel.id = 'anno-info-panel';
  infoPanel.className = 'anno-info-panel hidden';
  infoPanel.innerHTML = '<div class="anno-info-content"></div>';
  document.getElementById('page-map')?.appendChild(infoPanel);
}

function showInfoPanel(node) {
  if (!infoPanel) return;
  const isPoi = node.node_type === 'poi' || node.type === 'Polygon';
  const badgeClass = isPoi ? 'badge-poi' : 'badge-path';
  const badgeText = isPoi ? 'POI 兴趣点' : 'PATH 道路';

  let html = `
    <div class="anno-info-header">
      <h3>📍 ${esc(node.label || '(未命名)')}</h3>
      <button class="anno-info-close" onclick="document.getElementById('anno-info-panel').classList.add('hidden')">×</button>
    </div>
    <div class="anno-info-body">
      <span class="anno-badge ${badgeClass}">${badgeText}</span>
      <span class="anno-cat">${esc(node.category || '')}</span>
      ${node.description ? `<p class="anno-desc">${esc(node.description)}</p>` : ''}
  `;

  if (isPoi && node.knowledge) {
    const k = node.knowledge;
    if (k.summary) html += `<div class="anno-section"><h4>概述</h4><p>${esc(k.summary)}</p></div>`;
    if (k.historical_period) html += `<div class="anno-section"><h4>历史时期</h4><p>${esc(k.historical_period)}</p></div>`;
    if (k.related_people?.length) html += `<div class="anno-section"><h4>关联人物</h4><p>${esc(k.related_people.join('、'))}</p></div>`;
    if (k.sub_items?.length) {
      html += `<div class="anno-section"><h4>小物件（${k.sub_items.length}）</h4>`;
      k.sub_items.forEach(s => {
        html += `<div class="anno-sub-item"><strong>${esc(s.name)}</strong>${s.description ? '<br>'+esc(s.description) : ''}${s.visual_clue ? '<br><span class="clue">🔍 '+esc(s.visual_clue)+'</span>' : ''}</div>`;
      });
      html += '</div>';
    }
    if (k.stories?.length) {
      html += `<div class="anno-section"><h4>故事（${k.stories.length}）</h4>`;
      k.stories.forEach(s => {
        html += `<div class="anno-sub-item"><strong>${esc(s.title)}</strong>${s.content ? '<br>'+esc(s.content) : ''}</div>`;
      });
      html += '</div>';
    }
  }

  if (!isPoi && node.waypoints?.length) {
    html += `<div class="anno-section"><h4>关键节点（${node.waypoints.length}）</h4>`;
    node.waypoints.forEach(w => {
      const actionMap = { turn_left: '← 左转', turn_right: '→ 右转', pass_by: '● 经过', arrive: '★ 到达' };
      html += `<div class="anno-sub-item"><span class="wp-seq">#${w.seq||'?'}</span> ${actionMap[w.action]||''} ${esc(w.description||'')}${w.visual_clue ? '<br><span class="clue">🔍 '+esc(w.visual_clue)+'</span>' : ''}</div>`;
    });
    html += '</div>';
    if (node.surface) html += `<div class="anno-section"><h4>路面</h4><p>${esc(node.surface)}</p></div>`;
    if (node.difficulty) html += `<div class="anno-section"><h4>难度</h4><p>${esc(node.difficulty)}</p></div>`;
  }

  // AI 讲解按钮
  html += `
    <div class="anno-actions">
      <button class="btn-ai-narrate" data-node-id="${esc(node._id)}" data-mode="welcome">🤖 AI 讲解</button>
  `;
  if (isPoi) {
    // 子物件讲解按钮
    (node.knowledge?.sub_items || []).forEach((s, i) => {
      html += `<button class="btn-ai-narrate btn-ai-sm" data-node-id="${esc(node._id)}" data-mode="detail" data-sub="${esc(s.name)}">🔍 ${esc(s.name)}</button>`;
    });
    // 故事按钮
    (node.knowledge?.stories || []).forEach((s, i) => {
      html += `<button class="btn-ai-narrate btn-ai-sm" data-node-id="${esc(node._id)}" data-mode="story" data-story="${i}">📖 ${esc(s.title)}</button>`;
    });
  }
  html += '</div>';

  // 讲解输出区域
  html += '<div class="anno-narration" id="anno-narration" style="display:none"><div class="anno-narration-text"></div></div>';

  html += '</div>';
  infoPanel.querySelector('.anno-info-content').innerHTML = html;
  infoPanel.classList.remove('hidden');

  // 绑定 AI 讲解按钮
  infoPanel.querySelectorAll('.btn-ai-narrate').forEach(btn => {
    btn.addEventListener('click', async function() {
      const nodeId = this.dataset.nodeId;
      const mode = this.dataset.mode;
      const extra = {};
      if (this.dataset.sub) extra.sub_item = this.dataset.sub;
      if (this.dataset.story !== undefined) extra.story_index = parseInt(this.dataset.story);

      const narrationDiv = document.getElementById('anno-narration');
      const textDiv = narrationDiv?.querySelector('.anno-narration-text');
      if (narrationDiv) narrationDiv.style.display = 'block';
      if (textDiv) textDiv.innerHTML = '⏳ AI 正在生成讲解...';

      try {
        const res = await api.post('/api/heritage/narrate', { annotation_id: nodeId, mode, extra });
        if (res.success && res.data) {
          if (textDiv) textDiv.textContent = res.data.text;
          // 浏览器 TTS 自动播报
          speakText(res.data.text);
        }
      } catch (err) {
        if (textDiv) textDiv.textContent = '讲解生成失败: ' + err.message;
      }
    });
  });
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

function hideInfoPanel() {
  if (infoPanel) infoPanel.classList.add('hidden');
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/** 获取当前已加载的标注列表（供外部调用，如 Shift 吸附） */
export function getAnnotations() { return annotations; }
