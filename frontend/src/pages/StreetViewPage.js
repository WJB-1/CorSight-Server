/**
 * 街景管理页 - 真实数据
 */

import { getAllPoints } from '../services/api.js';

export class StreetViewPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.points = [];
    this.loading = false;
    this.render();
    this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🗺️ 街景数据管理</span>
          <div>
            <span id="sv-count" style="margin-right:16px;color:var(--text-muted);font-size:13px;">加载中...</span>
            <button class="btn btn-primary" id="sv-refresh">🔄 刷新</button>
          </div>
        </div>
        <div id="sv-table-container">
          <div class="placeholder-box" style="padding:60px;">
            <div class="placeholder-icon">⏳</div>
            <div class="placeholder-text">正在加载数据...</div>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#sv-refresh')?.addEventListener('click', () => {
      this.loadData();
    });
  }

  async loadData() {
    this.loading = true;
    this.updateTable();

    try {
      const result = await getAllPoints();
      this.points = result.data?.points || [];
    } catch (err) {
      console.error('加载街景数据失败:', err);
      this.points = [];
    } finally {
      this.loading = false;
      this.updateTable();
      this.updateCount();
    }
  }

  updateCount() {
    const el = this.container.querySelector('#sv-count');
    if (el) {
      el.textContent = `共 ${this.points.length} 条记录`;
    }
  }

  updateTable() {
    const container = this.container.querySelector('#sv-table-container');
    if (!container) return;

    if (this.loading) {
      container.innerHTML = `
        <div class="placeholder-box" style="padding:60px;">
          <div class="placeholder-icon">⏳</div>
          <div class="placeholder-text">正在加载数据...</div>
        </div>
      `;
      return;
    }

    if (this.points.length === 0) {
      container.innerHTML = `
        <div class="placeholder-box" style="padding:60px;">
          <div class="placeholder-icon">📭</div>
          <div class="placeholder-text">暂无数据</div>
        </div>
      `;
      return;
    }

    const rows = this.points.map(p => {
      const imgCount = Object.values(p.images || {}).filter(v => v).length;
      const lat = p.location?.latitude?.toFixed(6) || '--';
      const lon = p.location?.longitude?.toFixed(6) || '--';
      return `
        <tr data-id="${p.point_id}">
          <td><strong>${p.point_id}</strong></td>
          <td>${lon}, ${lat}</td>
          <td>${p.scene_description || '无描述'}</td>
          <td>${imgCount}/8</td>
          <td>
            <button class="btn btn-default sv-view-btn" data-id="${p.point_id}" style="padding:4px 10px;font-size:12px;">👁️ 查看</button>
            <button class="btn btn-default sv-del-btn" data-id="${p.point_id}" style="padding:4px 10px;font-size:12px;color:var(--error);">🗑️ 删除</button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="table-placeholder">
        <thead>
          <tr>
            <th>点位 ID</th>
            <th>坐标</th>
            <th>场景描述</th>
            <th>图片数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // 绑定查看按钮
    container.querySelectorAll('.sv-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.viewPoint(id);
      });
    });

    // 绑定删除按钮
    container.querySelectorAll('.sv-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.deletePoint(id);
      });
    });
  }

  viewPoint(pointId) {
    const point = this.points.find(p => p.point_id === pointId);
    if (!point) return;

    // 简单的图片预览弹窗
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirLabels = { N: '北', NE: '东北', E: '东', SE: '东南', S: '南', SW: '西南', W: '西', NW: '西北' };

    const imagesHtml = directions.map(dir => {
      const url = point.images?.[dir];
      if (!url) return `<div style="background:#f1f5f9;border-radius:4px;display:flex;align-items:center;justify-content:center;height:120px;color:#94a3b8;font-size:12px;">${dirLabels[dir]}<br>无图片</div>`;
      return `<div style="position:relative;"><img src="${url}" style="width:100%;height:120px;object-fit:cover;border-radius:4px;cursor:pointer;" onclick="window.open('${url}')"><span style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;">${dirLabels[dir]}</span></div>`;
    }).join('');

    // 创建独立的预览弹窗（不依赖 .modal 样式，避免被父容器限制）
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      padding: 40px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: #fff; border-radius: 8px; max-width: 1000px; width: 100%;
      max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    `;
    // 区分坐标系说明
    const isLegacy = /^P\d+$/.test(point.point_id);
    const coordLabel = isLegacy ? '高德坐标' : '原始坐标(WGS84)';

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
        <span style="font-size:16px;font-weight:700;color:#0f172a;">📸 ${point.point_id}</span>
        <button id="sv-preview-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#64748b;">&times;</button>
      </div>
      <div style="padding:20px;">
        <p style="margin-bottom:12px;color:#334155;font-size:14px;"><strong>${coordLabel}:</strong> ${point.location?.longitude?.toFixed(6)}, ${point.location?.latitude?.toFixed(6)}</p>
        <p style="margin-bottom:20px;color:#334155;font-size:14px;"><strong>描述:</strong> ${point.scene_description || '无'}</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">${imagesHtml}</div>
      </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // 关闭事件
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    content.querySelector('#sv-preview-close').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  async deletePoint(pointId) {
    if (!confirm(`确定要删除点位 ${pointId} 吗？此操作不可恢复。`)) return;

    try {
      // 暂时只在前端移除，后端删除接口待实现
      this.points = this.points.filter(p => p.point_id !== pointId);
      this.updateTable();
      this.updateCount();
      alert('已删除（前端演示，后端接口待实现）');
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }
}

export default StreetViewPage;
