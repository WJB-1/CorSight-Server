/**
 * 左侧面板模块 — 展示采样点详情
 *
 * 包括：街景图片、扇形覆盖、VLM 标签、描述
 */

import { renderSectors, clearSectors } from './map.js';
import { escapeHtml, escapeAttr } from './utils.js';

const panel = document.getElementById('panel-left');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const panelClose = document.getElementById('panel-close');

/** 当前选中的点 */
let currentPoint = null;

/** 图片预览回调 */
let onImagePreview = null;

export function initPanel(opts = {}) {
  onImagePreview = opts.onImagePreview || (() => {});
  panelClose.addEventListener('click', closePanel);

  // 使用事件委托处理图片点击（替代全局 window.__previewImage）
  panelBody.addEventListener('click', (e) => {
    const card = e.target.closest('.img-card');
    if (card && onImagePreview) {
      onImagePreview(card.dataset.src);
    }
  });
}

/**
 * 打开面板，展示采样点详情
 */
export function openPanel(pointData) {
  currentPoint = pointData;
  panelTitle.textContent = pointData.point_id;

  const images = pointData.images || [];
  const mergedTags = pointData.merged_osm_tags || {};
  const description = pointData.merged_description || '';

  let html = '';

  // ── 街景图片网格 ───────────────────────────────
  if (images.length > 0) {
    html += '<h4 style="margin:8px 0;font-size:13px;color:#00d2ff">街景图片</h4>';
    html += '<div class="img-grid">';
    for (const img of images) {
      const bearingLabel = bearingToLabel(img.bearing);
      const src = img.path || '';
      html += `
        <div class="img-card" data-src="${escapeAttr(src)}">
          <img src="${escapeAttr(src)}" alt="${escapeAttr(bearingLabel)}" loading="lazy" onerror="this.parentElement.querySelector('.img-error')||(this.style.display='none',this.parentElement.insertAdjacentHTML('beforeend','<div class=\\'img-error\\'>加载失败</div>'))">
          <span class="bearing-tag">${escapeHtml(bearingLabel)} ${img.bearing}°</span>
        </div>`;
    }
    html += '</div>';
  }

  // ── 合并标签 ───────────────────────────────────
  const tagKeys = Object.keys(mergedTags);
  if (tagKeys.length > 0) {
    html += '<h4 style="margin:12px 0 6px;font-size:13px;color:#00d2ff">OSM 标签（合并）</h4>';
    html += '<div class="tag-list">';
    for (const key of tagKeys) {
      html += `<span class="tag-item"><span class="key">${escapeHtml(key)}</span><span class="val">${escapeHtml(mergedTags[key])}</span></span>`;
    }
    html += '</div>';
  }

  // ── 合并描述 ───────────────────────────────────
  if (description) {
    html += '<h4 style="margin:12px 0 6px;font-size:13px;color:#00d2ff">语义描述</h4>';
    html += `<div class="description-box">${escapeHtml(description)}</div>`;
  }

  // ── 每张图片的独立标签 ─────────────────────────
  const imagesWithTags = images.filter((i) => i.osm_tags && Object.keys(i.osm_tags).length > 0);
  if (imagesWithTags.length > 0) {
    html += '<h4 style="margin:12px 0 6px;font-size:13px;color:#00d2ff">VLM 分析结果（逐图）</h4>';
    for (const img of imagesWithTags) {
      const bearingLabel = bearingToLabel(img.bearing);
      html += `<div style="margin:6px 0;padding:8px;background:rgba(255,255,255,.03);border-radius:4px;">`;
      html += `<div style="font-size:12px;color:#8899aa;margin-bottom:4px">${escapeHtml(bearingLabel)} ${img.bearing}°${img.scene_type ? ' · ' + escapeHtml(img.scene_type) : ''}</div>`;
      html += '<div class="tag-list">';
      for (const [k, v] of Object.entries(img.osm_tags)) {
        html += `<span class="tag-item"><span class="key">${escapeHtml(k)}</span><span class="val">${escapeHtml(v)}</span></span>`;
      }
      html += '</div>';
      if (img.description) html += `<div style="font-size:12px;color:#999;margin-top:4px">${escapeHtml(img.description)}</div>`;
      html += '</div>';
    }
  }

  // ── 状态 ───────────────────────────────────────
  html += `<div style="margin-top:12px;font-size:12px;color:#555">状态: ${pointData.status || 'unknown'}</div>`;

  panelBody.innerHTML = html;
  panel.classList.remove('hidden');

  // 绘制扇形覆盖
  renderSectors(pointData.point_id, images);
}

export function closePanel() {
  panel.classList.add('hidden');
  clearSectors();
  currentPoint = null;
}

// ── 方位角转中文 ─────────────────────────────────

function bearingToLabel(deg) {
  const labels = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return labels[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

// 已移除 window.__previewImage 全局函数，改用事件委托（见 initPanel 中的 panelBody click 监听）
