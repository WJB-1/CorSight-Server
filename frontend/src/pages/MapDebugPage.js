/**
 * 地图调试页 - 占位
 */

export class MapDebugPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="page-placeholder">
        <div class="page-placeholder-icon">🧭</div>
        <div class="page-placeholder-text">地图调试</div>
        <div class="page-placeholder-hint">待开发</div>
      </div>
    `;
  }

  destroy() {}
}

export default MapDebugPage;
