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
      <div class="card">
        <div class="card-header">
          <span class="card-title">⚙️ 服务器配置</span>
        </div>
        <div class="placeholder-box">
          <div class="placeholder-icon">🔧</div>
          <div class="placeholder-text">端口、数据库、缓存等配置项</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">🔑 API Key 管理</span>
        </div>
        <div class="placeholder-box">
          <div class="placeholder-icon">🗝️</div>
          <div class="placeholder-text">高德地图、LLM 等 API Key 配置</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 日志配置</span>
        </div>
        <div class="placeholder-box">
          <div class="placeholder-icon">📝</div>
          <div class="placeholder-text">日志级别、存储策略等配置</div>
        </div>
      </div>
    `;
  }
}

export default SettingsPage;
