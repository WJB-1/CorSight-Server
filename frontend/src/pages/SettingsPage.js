/**
 * 系统配置页 - 占位
 */

export class SettingsPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="page-placeholder">
        <div class="page-placeholder-icon">⚙️</div>
        <div class="page-placeholder-text">系统配置</div>
        <div class="page-placeholder-hint">待开发</div>
      </div>
    `;
  }

  destroy() {}
}

export default SettingsPage;
