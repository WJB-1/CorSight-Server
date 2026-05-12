/**
 * 地图调试脚本
 * 在浏览器控制台执行，检查地图初始化问题
 */

(function debugMap() {
  console.log('=== 地图调试开始 ===');
  
  // 1. 检查容器
  const container = document.getElementById('map-viewer');
  console.log('地图容器:', container);
  if (container) {
    const rect = container.getBoundingClientRect();
    console.log('容器尺寸:', {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left
    });
    
    // 检查容器是否有子元素（地图应该创建了canvas或div）
    console.log('容器子元素数:', container.children.length);
    console.log('容器子元素:', Array.from(container.children).map(c => c.tagName));
  } else {
    console.error('❌ 找不到地图容器 #map-viewer');
  }
  
  // 2. 检查地图实例
  if (window.appState && window.appState.map) {
    const map = window.appState.map;
    console.log('地图实例存在:', map);
    console.log('地图中心:', map.getCenter());
    console.log('地图缩放级别:', map.getZoom());
    console.log('地图大小:', map.getSize());
    
    // 尝试刷新地图
    console.log('尝试触发 resize...');
    map.resize();
    
    // 检查地图容器内部
    const mapContainer = container.querySelector('.amap-container');
    if (mapContainer) {
      console.log('✅ 高德地图容器存在');
      const canvas = mapContainer.querySelector('canvas');
      console.log('Canvas 存在:', !!canvas);
    } else {
      console.error('❌ 高德地图容器不存在');
    }
  } else {
    console.error('❌ window.appState.map 不存在，地图可能初始化失败');
  }
  
  // 3. 检查 MapViewer 实例
  if (window.appState && window.appState.mapViewer) {
    console.log('MapViewer 实例存在');
  } else {
    console.error('❌ MapViewer 实例不存在');
  }
  
  // 4. 修复方案：强制设置容器高度并重绘
  console.log('\n=== 尝试修复 ===');
  if (container) {
    container.style.height = '600px';
    container.style.minHeight = '600px';
    console.log('已设置容器高度为 600px');
    
    if (window.appState && window.appState.map) {
      setTimeout(() => {
        window.appState.map.resize();
        console.log('已触发地图 resize');
      }, 100);
    }
  }
  
  console.log('=== 调试结束 ===');
})();
