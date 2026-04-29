/**
 * 地图查看器组件
 */

import { getNearbyPoints } from '../services/api.js';

export class MapViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.map = null;
    this.markers = [];
    this.onReady = null;
    this.onMarkerClick = null;
    this.onContextMenu = null;

    // 直接开始初始化
    this.init();
  }

  async init() {
    console.log('🗺️  MapViewer 初始化...');

    try {
      // 等待 AMapLoader 可用
      while (typeof AMapLoader === 'undefined') {
        await new Promise(r => setTimeout(r, 100));
      }

      console.log('✅ AMapLoader 可用');

      // 使用 Loader 加载 AMap
      const AMap = await AMapLoader.load({
        key: "6e760d76e5650f0f9004c5412dcfc58e",
        version: "2.0",
        plugins: ['AMap.Scale', 'AMap.ToolBar']
      });

      console.log('✅ AMap 加载成功，版本:', AMap.version);

      // 创建地图 - 默认定位到广州体育中心
      this.map = new AMap.Map(this.container, {
        zoom: 17,
        center: [113.3245, 23.1358], // 广州体育中心坐标
        viewMode: '2D'
      });

      // 尝试获取用户当前位置
      this.getCurrentPosition();

      console.log('✅ 地图创建成功');

      // 添加控件
      this.map.addControl(new AMap.Scale());
      this.map.addControl(new AMap.ToolBar({ position: 'RB' }));

      // 绑定事件
      this.map.on('moveend', () => {
        const c = this.map.getCenter();
        this.loadNearbyPoints(c.lat, c.lng);
      });

      this.map.on('rightclick', (e) => {
        if (this.onContextMenu) {
          this.onContextMenu(e.lnglat.lng, e.lnglat.lat, e.pixel);
        }
      });

      // 触发就绪
      if (this.onReady) {
        this.onReady(this.map);
      }

      // 加载采样点
      const c = this.map.getCenter();
      this.loadNearbyPoints(c.lat, c.lng);

    } catch (err) {
      console.error('❌ 地图初始化失败:', err);
      this.container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:red;">地图加载失败: ${err.message}</div>`;
    }
  }

  async loadNearbyPoints(lat, lng) {
    try {
      const res = await getNearbyPoints(lat, lng, 1000);
      const points = res.data?.points || [];
      console.log(`📍 找到 ${points.length} 个采样点`);

      this.markers.forEach(m => m.setMap(null));
      this.markers = [];

      points.forEach(p => {
        const marker = new AMap.Marker({
          position: [p.location.longitude, p.location.latitude],
          content: '<div style="background:#1890ff;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;">📍 ' + p.point_id + '</div>',
          offset: new AMap.Pixel(-20, -20)
        });

        marker.on('click', () => {
          if (this.onMarkerClick) this.onMarkerClick(p);
        });

        marker.setMap(this.map);
        this.markers.push(marker);
      });

    } catch (err) {
      console.error('❌ 加载采样点失败:', err);
    }
  }

  setOrigin(lng, lat) {
    if (this.originMarker) this.originMarker.setMap(null);
    this.originMarker = new AMap.Marker({
      position: [lng, lat],
      content: '<div style="background:#52c41a;color:#fff;padding:6px 12px;border-radius:50%;font-weight:bold;">起</div>',
      offset: new AMap.Pixel(-15, -15)
    });
    this.originMarker.setMap(this.map);
  }

  setDestination(lng, lat) {
    if (this.destMarker) this.destMarker.setMap(null);
    this.destMarker = new AMap.Marker({
      position: [lng, lat],
      content: '<div style="background:#f5222d;color:#fff;padding:6px 12px;border-radius:50%;font-weight:bold;">终</div>',
      offset: new AMap.Pixel(-15, -15)
    });
    this.destMarker.setMap(this.map);
  }

  /**
   * 获取浏览器当前位置
   */
  getCurrentPosition() {
    if (!navigator.geolocation) {
      console.log('浏览器不支持定位');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📍 获取到当前位置:', latitude, longitude);

        // 移动到当前位置
        this.map.setCenter([longitude, latitude]);
        this.map.setZoom(17);

        // 添加当前位置标记
        if (this.currentPosMarker) {
          this.currentPosMarker.setMap(null);
        }
        this.currentPosMarker = new AMap.Marker({
          position: [longitude, latitude],
          content: '<div style="background:#1890ff;color:#fff;padding:6px 12px;border-radius:50%;font-weight:bold;border:2px solid #fff;">我</div>',
          offset: new AMap.Pixel(-15, -15),
          zIndex: 100
        });
        this.currentPosMarker.setMap(this.map);

        // 加载附近采样点
        this.loadNearbyPoints(latitude, longitude);
      },
      (error) => {
        console.log('定位失败:', error.message);
        // 使用默认位置（广州体育中心）
        this.loadNearbyPoints(23.1358, 113.3245);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  /**
   * Phase 5: 高亮显示关键节点
   * 在地图上标记推演路线的关键决策点
   * @param {Array} keyNodes - 关键节点数组
   */
  highlightKeyNodes(keyNodes) {
    if (!this.map || !keyNodes || keyNodes.length === 0) return;

    console.log('[MapViewer] 标记关键节点:', keyNodes.length);

    // 清除之前的关键节点标记
    if (this.keyNodeMarkers) {
      this.map.remove(this.keyNodeMarkers);
    }
    this.keyNodeMarkers = [];

    // 创建关键节点标记
    for (let i = 0; i < keyNodes.length; i++) {
      const node = keyNodes[i];
      if (!node.coordinates || node.coordinates.length < 2) continue;

      const [lng, lat] = node.coordinates;

      // 创建标记
      const marker = new AMap.Marker({
        position: [lng, lat],
        title: `节点 ${i + 1}: ${node.action || '直行'}`,
        label: {
          content: `<div style="
            background: #FFD700;
            color: #000;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${i + 1}</div>`,
          offset: new AMap.Pixel(0, -20)
        },
        icon: new AMap.Icon({
          size: new AMap.Size(24, 24),
          image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png',
          imageSize: new AMap.Size(24, 24)
        })
      });

      marker.setMap(this.map);
      this.keyNodeMarkers.push(marker);
    }

    // 调整视野以包含所有关键节点
    if (this.keyNodeMarkers.length > 0) {
      this.map.setFitView(this.keyNodeMarkers, false, [50, 50, 50, 50]);
    }
  }

  /**
   * Phase 5: 平移到指定节点并高亮
   * 用于语音播报时的地图联动
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @param {number} nodeIndex - 节点索引
   */
  panToNode(lng, lat, nodeIndex) {
    if (!this.map) return;

    // 平滑移动到节点位置
    this.map.panTo([lng, lat]);

    // 可以在这里添加节点高亮效果
    console.log(`[MapViewer] 聚焦到节点 ${nodeIndex}: [${lng}, ${lat}]`);
  }

  /**
   * Phase 5: 清除关键节点标记
   */
  clearKeyNodes() {
    if (this.keyNodeMarkers) {
      this.map.remove(this.keyNodeMarkers);
      this.keyNodeMarkers = [];
    }
  }
}

