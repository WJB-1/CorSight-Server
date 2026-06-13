/**
 * 街景管理页 - 占位
 */

export class StreetViewPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="page-placeholder">
        <div class="page-placeholder-icon">🗺️</div>
        <div class="page-placeholder-text">街景管理</div>
        <div class="page-placeholder-hint">待开发</div>
      </div>
    `;
  }

  destroy() {}
}

export default StreetViewPage;
