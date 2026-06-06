/**
 * 主布局组件
 * 组合 Sidebar + Header + Content
 */

import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';

export class AdminLayout {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.onNavigate = options.onNavigate || (() => {});
    this.activePage = options.activePage || 'dashboard';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <aside id="admin-sidebar"></aside>
      <div class="main-area">
        <header id="admin-header" class="top-header"></header>
        <main id="admin-content" class="content"></main>
      </div>
      <div id="sidebar-overlay" class="sidebar-overlay"></div>
    `;

    this.sidebar = new Sidebar('admin-sidebar', {
      activeId: this.activePage,
      onNavigate: (id) => {
        this.activePage = id;
        this.header.updateTitle(id);
        this.onNavigate(id);
        // 移动端点击后关闭侧边栏
        if (window.innerWidth <= 768) {
          this.closeMobileSidebar();
        }
      },
    });

    this.header = new Header('admin-header', { pageId: this.activePage });

    this.bindEvents();
  }

  bindEvents() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.addEventListener('click', () => {
      this.closeMobileSidebar();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        this.closeMobileSidebar();
      }
    });
  }

  openMobileSidebar() {
    document.getElementById('admin-sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  }

  closeMobileSidebar() {
    document.getElementById('admin-sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  getContentContainer() {
    return document.getElementById('admin-content');
  }
}

export default AdminLayout;
