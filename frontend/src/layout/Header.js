/**
 * 顶部 Header 组件
 */

const PAGE_TITLES = {
  dashboard: '系统概览',
  streetview: '街景管理',
  accounts: '账号管理',
  settings: '系统配置',
  monitor: 'API 监控',
  map: '地图调试',
};

export class Header {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.pageId = options.pageId || 'dashboard';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="breadcrumb">${PAGE_TITLES[this.pageId] || 'CorSight Console'}</div>
      <div class="header-actions">
        <button class="header-icon-btn" title="通知">🔔</button>
        <div class="user-menu">
          <div class="user-avatar">A</div>
          <span>Admin</span>
        </div>
      </div>
    `;
  }

  updateTitle(pageId) {
    this.pageId = pageId;
    const breadcrumb = this.container.querySelector('.breadcrumb');
    if (breadcrumb) {
      breadcrumb.textContent = PAGE_TITLES[pageId] || 'CorSight Console';
    }
  }
}

export default Header;
