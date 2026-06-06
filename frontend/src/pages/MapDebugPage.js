/**
 * 地图调试页 - 真实地图 + 采样点标注
 */

import { getAllPoints, getStats, testNavigationPreview } from '../services/api.js';

export class MapDebugPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.map = null;
    this.markers = [];
    this.render();
    this.loadAMap();
  }

  render() {
    this.container.innerHTML = `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header">
          <span class="card-title">🧭 地图调试</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary" id="map-refresh">🔄 刷新数据</button>
            <button class="btn btn-default" id="map-health-check">💓 服务检查</button>
            <button class="btn btn-default" id="map-test-nav">🚀 快速推演</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <span class="card-title">📍 采样点地图</span>
            <span id="map-point-count" style="font-size:12px;color:#94a3b8;">加载中...</span>
          </div>
          <div id="map-viewer" style="height:400px;"></div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">📋 推演结果</span>
          </div>
          <div id="map-nav-result" class="placeholder-box" style="height:400px;display:flex;flex-direction:column;justify-content:center;">
            <div class="placeholder-icon">🧭</div>
            <div class="placeholder-text">点击"快速推演"查看导航结果</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <span class="card-title">📊 采样点列表</span>
        </div>
        <div id="map-points-list">
          <div class="placeholder-box" style="padding:30px;">
            <div class="placeholder-icon">⏳</div>
            <div class="placeholder-text">加载中...</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <span class="card-title">🔧 服务状态</span>
        </div>
        <div id="map-health-result">
          <div class="placeholder-box" style="padding:20px;">
            <div class="placeholder-text">点击"服务检查"查看状态</div>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#map-refresh').addEventListener('click', () => this.loadMapData());
    this.container.querySelector('#map-health-check').addEventListener('click', () => this.runHealthCheck());
    this.container.querySelector('#map-test-nav').addEventListener('click', () => this.runTestNav());
  }

  async loadAMap() {
    const mapDiv = this.container.querySelector('#map-viewer');
    if (!mapDiv) return;

    const showError = (msg) => {
      mapDiv.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:14px;">❌ ${msg}</div>`;
    };

    window._AMapSecurityConfig = {
      securityJsCode: '3bbda8110ca478853e8500df55ee9a7d'
    };

    // 注册全局坐标验证函数
    window._verifyCoord = (pointId, lon, lat) => {
      if (!window.AMap || !window.AMap.convertFrom) {
        alert('高德地图转换插件未加载');
        return;
      }
      // 假设当前坐标是 GCJ02，先转 WGS84，再转回 GCJ02，看是否一致
      const coord = new window.AMap.LngLat(lon, lat);
      window.AMap.convertFrom([coord], 'gcj02', (status, result) => {
        if (status === 'complete' && result.info === 'ok') {
          const wgs = result.locations[0];
          // 再转回 GCJ02
          const wgsCoord = new window.AMap.LngLat(wgs.lng, wgs.lat);
          window.AMap.convertFrom([wgsCoord], 'gps', (s2, r2) => {
            if (s2 === 'complete' && r2.info === 'ok') {
              const back = r2.locations[0];
              const diffLon = Math.abs(back.lng - lon);
              const diffLat = Math.abs(back.lat - lat);
              alert(`${pointId} 坐标验证:\n原始: ${lon.toFixed(6)}, ${lat.toFixed(6)}\nGCJ02→WGS84→GCJ02: ${back.lng.toFixed(6)}, ${back.lat.toFixed(6)}\n误差: ${(diffLon * 111000).toFixed(1)}m(经), ${(diffLat * 111000).toFixed(1)}m(纬)\n\n如果误差很小(<1m)，说明已是正确 GCJ02。`);
            }
          });
        }
      });
    };

    // 检查是否已加载
    if (window.AMap && window.AMap.Map) {
      this.map = new window.AMap.Map('map-viewer', {
        zoom: 15,
        center: [113.33, 23.13]
      });
      this.loadMapData();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://webapi.amap.com/loader.js';
    script.onload = () => {
      if (!window.AMapLoader) {
        showError('高德地图加载器初始化失败');
        return;
      }
      window.AMapLoader.load({
        key: 'd1d74bf027c06b731c70dd1e6c285125',
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.TileLayer', 'AMap.ConvertFrom']
      }).then((AMap) => {
        this.map = new AMap.Map('map-viewer', {
          zoom: 15,
          center: [113.33, 23.13],
          viewMode: '2D'
        });
        // 添加标准图层确保显示道路和 POI
        const tileLayer = new AMap.TileLayer();
        this.map.add(tileLayer);
        this.loadMapData();
      }).catch((e) => {
        showError(`高德地图加载失败: ${e.message || '请检查 API Key'}`);
      });
    };
    script.onerror = () => {
      showError('高德地图 CDN 加载失败，请检查网络');
    };
    document.head.appendChild(script);
  }

  async loadMapData() {
    try {
      const result = await getAllPoints();
      const points = result.data?.points || [];

      this.container.querySelector('#map-point-count').textContent = `${points.length} 个采样点`;

      // 在地图上标注
      if (this.map && window.AMap) {
        // 清除旧标记
        this.markers.forEach(m => m.remove());
        this.markers = [];

        // 区分坐标系：P001-P033 已经是 GCJ-02，P_ 开头的是 WGS-84 需要转换
        const legacyPoints = points.filter(p => /^P\d+$/.test(p.point_id));
        const newPoints = points.filter(p => /^P_/.test(p.point_id));

        // 旧点直接标注（已是 GCJ-02）
        legacyPoints.forEach(p => {
          const lng = p.location.longitude;
          const lat = p.location.latitude;
          this.addMarker(p, lng, lat, false);
        });

        // 新点需要 WGS84 -> GCJ02 转换
        if (newPoints.length > 0) {
          const wgsCoords = newPoints.map(p => new window.AMap.LngLat(p.location.longitude, p.location.latitude));
          window.AMap.convertFrom(wgsCoords, 'gps', (status, result) => {
            if (status !== 'complete' || result.info !== 'ok') {
              console.warn('[Map] 坐标转换失败，使用原始坐标');
            }
            newPoints.forEach((p, i) => {
              const lng = result.locations?.[i]?.lng || p.location.longitude;
              const lat = result.locations?.[i]?.lat || p.location.latitude;
              this.addMarker(p, lng, lat, true);
            });
            this.fitView();
          });
        } else {
          this.fitView();
        }
      }

      // 列表
      this.updatePointsList(points);
    } catch (err) {
      this.container.querySelector('#map-point-count').textContent = '加载失败';
      this.container.querySelector('#map-points-list').innerHTML = `<div class="placeholder-box" style="padding:20px;color:#dc2626;">加载失败: ${err.message}</div>`;
    }
  }

  updatePointsList(points) {
    if (points.length === 0) {
      this.container.querySelector('#map-points-list').innerHTML = '<div class="placeholder-box" style="padding:20px;">暂无数据</div>';
      return;
    }

    const rows = points.slice(0, 20).map(p => {
      const imgs = Object.values(p.images || {}).filter(v => v).length;
      return `
        <tr>
          <td><strong>${p.point_id}</strong></td>
          <td>${p.location?.longitude?.toFixed(6)}, ${p.location?.latitude?.toFixed(6)}</td>
          <td>${p.scene_description || '无'}</td>
          <td>${imgs}/8</td>
        </tr>
      `;
    }).join('');

    this.container.querySelector('#map-points-list').innerHTML = `
      <div style="margin-bottom:8px;font-size:13px;color:#64748b;">共 ${points.length} 个采样点${points.length > 20 ? '，显示前 20 个' : ''}</div>
      <table class="table-placeholder">
        <thead><tr><th>点位 ID</th><th>坐标</th><th>场景描述</th><th>图片</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  async runHealthCheck() {
    const el = this.container.querySelector('#map-health-result');
    el.innerHTML = '<div class="placeholder-box" style="padding:20px;"><div class="placeholder-text">检查中...</div></div>';

    try {
      const result = await getStats();
      el.innerHTML = `
        <table class="table-placeholder">
          <thead><tr><th>项目</th><th>状态</th></tr></thead>
          <tbody>
            <tr><td>后端连接</td><td style="color:#16a34a;font-weight:600;">✅ 正常</td></tr>
            <tr><td>采样点总数</td><td>${result.data?.total_points || 0}</td></tr>
            <tr><td>本周新增</td><td>${result.data?.week_points || 0}</td></tr>
            <tr><td>今日新增</td><td>${result.data?.today_points || 0}</td></tr>
          </tbody>
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div class="placeholder-box" style="padding:20px;color:#dc2626;">❌ 服务不可达: ${err.message}</div>`;
    }
  }

  async runTestNav() {
    const el = this.container.querySelector('#map-nav-result');
    el.innerHTML = '<div class="placeholder-box" style="height:400px;display:flex;flex-direction:column;justify-content:center;"><div class="placeholder-icon">⏳</div><div class="placeholder-text">推演中，可能需要 15-30 秒...</div></div>';

    try {
      const result = await testNavigationPreview();
      const data = result.data;

      const nodesHtml = (data.key_nodes || []).map(n => `
        <div style="padding:10px;border-left:3px solid #2563eb;margin-bottom:8px;background:#f8fafc;border-radius:0 4px 4px 0;">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
            <span style="background:#2563eb;color:#fff;padding:1px 8px;border-radius:3px;font-size:11px;font-weight:600;">${n.node_index}</span>
            <strong style="font-size:13px;">${n.action || ''}</strong>
            <span style="color:#64748b;font-size:12px;">🕐 ${n.clock_direction || ''}</span>
          </div>
          <p style="font-size:13px;color:#334155;margin:0;">${n.instruction || ''}</p>
        </div>
      `).join('');

      el.innerHTML = `
        <div style="margin-bottom:12px;">
          <span style="font-size:13px;color:#64748b;">📏 ${data.route_summary?.total_distance || '-'} · ⏱️ ${data.route_summary?.duration_estimate || '-'}</span>
        </div>
        <div style="max-height:300px;overflow-y:auto;">${nodesHtml}</div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="placeholder-box" style="height:400px;display:flex;flex-direction:column;justify-content:center;color:#dc2626;"><div class="placeholder-icon">❌</div><div class="placeholder-text">推演失败: ${err.message}</div></div>`;
    }
  }

  addMarker(p, lng, lat, converted) {
    const marker = new window.AMap.Marker({
      position: [lng, lat],
      label: {
        content: `<div style="background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #e2e8f0;font-size:11px;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);white-space:nowrap;">${p.point_id}</div>`,
        offset: new window.AMap.Pixel(0, -30)
      }
    });

    marker.on('click', () => {
      const imgs = Object.values(p.images || {}).filter(v => v).length;
      const coordInfo = converted
        ? `<div style="font-size:12px;color:#64748b;">原始(WGS84): ${p.location.longitude.toFixed(6)}, ${p.location.latitude.toFixed(6)}</div><div style="font-size:12px;color:#64748b;">转换(GCJ02): ${lng.toFixed(6)}, ${lat.toFixed(6)}</div>`
        : `<div style="font-size:12px;color:#64748b;">数据库坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}</div>`;
      const content = `
        <div style="padding:8px;min-width:200px;">
          <div style="font-weight:700;margin-bottom:6px;">${p.point_id}</div>
          ${coordInfo}
          <div style="font-size:12px;color:#64748b;">描述: ${p.scene_description || '无'}</div>
          <div style="font-size:12px;color:#64748b;">图片: ${imgs}/8</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;">
            <button onclick="window._verifyCoord('${p.point_id}', ${p.location.longitude}, ${p.location.latitude})" style="background:#2563eb;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;">验证坐标</button>
          </div>
        </div>
      `;
      const infoWindow = new window.AMap.InfoWindow({ content, offset: new window.AMap.Pixel(0, -40) });
      infoWindow.open(this.map, marker.getPosition());
    });

    this.map.add(marker);
    this.markers.push(marker);
  }

  fitView() {
    if (this.markers.length > 0) {
      this.map.setFitView(this.markers, false, [50, 50, 50, 320]);
    }
  }

  destroy() {
    if (this.map) {
      this.map.destroy();
      this.map = null;
    }
  }
}

export default MapDebugPage;
