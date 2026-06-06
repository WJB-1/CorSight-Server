/**
 * 概览页 - 真实数据
 */

import { getStats, getAllPoints } from '../services/api.js';

export class DashboardPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
    this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">总采样点</div>
          <div class="stat-value" id="stat-total">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">本周新增</div>
          <div class="stat-value" id="stat-week">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日新增</div>
          <div class="stat-value" id="stat-today">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">服务状态</div>
          <div class="stat-value" id="stat-status">--</div>
          <div class="stat-change" id="stat-status-text" style="font-size:12px;margin-top:4px;color:#94a3b8;">检查中...</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📍 最近采样点</span>
        </div>
        <div id="recent-points">
          <div class="placeholder-box" style="padding:30px;">
            <div class="placeholder-icon">⏳</div>
            <div class="placeholder-text">加载中...</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📈 服务信息</span>
        </div>
        <div id="server-info">
          <div class="placeholder-box" style="padding:30px;">
            <div class="placeholder-icon">⏳</div>
            <div class="placeholder-text">加载中...</div>
          </div>
        </div>
      </div>
    `;
  }

  async loadData() {
    // 统一加载，避免重复请求
    try {
      const statsResult = await getStats();
      const data = statsResult.data;

      // 统计卡片
      this.container.querySelector('#stat-total').textContent = data.total_points;
      this.container.querySelector('#stat-week').textContent = data.week_points;
      this.container.querySelector('#stat-today').textContent = data.today_points;

      // 服务状态：统计接口能通 = 后端正常
      this.container.querySelector('#stat-status').textContent = '✅ 正常';
      this.container.querySelector('#stat-status').style.color = '#16a34a';
      this.container.querySelector('#stat-status-text').textContent = '后端连接正常';

      this.container.querySelector('#server-info').innerHTML = `
        <table class="table-placeholder">
          <thead><tr><th>项目</th><th>状态</th></tr></thead>
          <tbody>
            <tr><td>服务</td><td style="font-weight:600;">CorSight Unified Server</td></tr>
            <tr><td>状态</td><td style="color:#16a34a;font-weight:600;">✅ 正常</td></tr>
            <tr><td>端口</td><td>5741</td></tr>
            <tr><td>数据库</td><td>blind_map (MongoDB)</td></tr>
          </tbody>
        </table>
      `;

      // 最近采样点
      try {
        const pointsResult = await getAllPoints();
        const points = pointsResult.data?.points || [];
        const recent = points.slice(0, 5);
        const rows = recent.map(p => `
          <tr>
            <td><strong>${p.point_id}</strong></td>
            <td>${p.location?.longitude?.toFixed(6)}, ${p.location?.latitude?.toFixed(6)}</td>
            <td>${p.scene_description || '无'}</td>
          </tr>
        `).join('');

        this.container.querySelector('#recent-points').innerHTML = `
          <table class="table-placeholder">
            <thead><tr><th>点位 ID</th><th>坐标</th><th>场景描述</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } catch {
        this.container.querySelector('#recent-points').innerHTML = '<div class="placeholder-box" style="padding:20px;">加载失败</div>';
      }

    } catch (err) {
      this.container.querySelector('#stat-total').textContent = '⚠️';
      this.container.querySelector('#stat-week').textContent = '⚠️';
      this.container.querySelector('#stat-today').textContent = '⚠️';
      this.container.querySelector('#stat-status').textContent = '❌ 异常';
      this.container.querySelector('#stat-status').style.color = '#dc2626';
      this.container.querySelector('#stat-status-text').textContent = '后端未启动';
      this.container.querySelector('#server-info').innerHTML = '<div class="placeholder-box" style="padding:20px;color:#dc2626;">后端服务未启动或不可达</div>';
      this.container.querySelector('#recent-points').innerHTML = '<div class="placeholder-box" style="padding:20px;">无法加载</div>';
    }
  }
}

export default DashboardPage;
