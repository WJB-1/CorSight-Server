/**
 * 侧边栏导航组件
 */

const NAV_ITEMS = [
  { id: 'dashboard', icon: '📊', label: '概览' },
  { id: 'streetview', icon: '🗺️', label: '街景管理' },
  { id: 'accounts', icon: '👤', label: '账号管理' },
  { id: 'settings', icon: '⚙️', label: '系统配置' },
  { id: 'monitor', icon: '📡', label: 'API 监控' },
  { id: 'map', icon: '🧭', label: '地图调试' },
];

export class Sidebar {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.onNavigate = options.onNavigate || (() => {});
    this.activeId = options.activeId || 'dashboard';
    this.collapsed = false;
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="sidebar-header">
        <span class="sidebar-logo">CorSight</span>
      </div>
      <nav class="sidebar-nav">
        ${NAV_ITEMS.map(item => `
          <a href="#/${item.id}" class="nav-item ${item.id === this.activeId ? 'active' : ''}" data-id="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <span class="version-text">v1.0.0</span>
        <button class="collapse-btn" title="收起/展开">◀</button>
      </div>
    `;

    this.elements = {
      navItems: this.container.querySelectorAll('.nav-item'),
      collapseBtn: this.container.querySelector('.collapse-btn'),
    };
  }

  bindEvents() {
    this.elements.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const id = item.dataset.id;
        this.setActive(id);
        this.onNavigate(id);
      });
    });

    this.elements.collapseBtn.addEventListener('click', () => {
      this.toggleCollapse();
    });
  }

  setActive(id) {
    this.activeId = id;
    this.elements.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.container.classList.toggle('collapsed', this.collapsed);
    this.elements.collapseBtn.textContent = this.collapsed ? '▶' : '◀';
  }
}

export default Sidebar;
