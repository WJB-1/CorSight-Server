/**
 * CorSight Console - 主入口
 * Admin Dashboard 路由与初始化
 */

import { AdminLayout } from './layout/AdminLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { StreetViewPage } from './pages/StreetViewPage.js';
import { AccountPage } from './pages/AccountPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { MonitorPage } from './pages/MonitorPage.js';
import { MapDebugPage } from './pages/MapDebugPage.js';

// 页面组件映射
const PAGES = {
  dashboard: DashboardPage,
  streetview: StreetViewPage,
  accounts: AccountPage,
  settings: SettingsPage,
  monitor: MonitorPage,
  map: MapDebugPage,
};

// 当前页面实例
let currentPageInstance = null;

/**
 * 获取当前路由
 */
function getRoute() {
  const hash = window.location.hash.replace('#/', '') || 'dashboard';
  return PAGES[hash] ? hash : 'dashboard';
}

/**
 * 切换页面
 */
function navigateTo(pageId) {
  // 销毁旧页面
  if (currentPageInstance && currentPageInstance.destroy) {
    currentPageInstance.destroy();
  }
  currentPageInstance = null;

  // 清空内容区
  const content = document.getElementById('admin-content');
  content.innerHTML = '';

  // 创建新页面
  const PageClass = PAGES[pageId];
  if (PageClass) {
    currentPageInstance = new PageClass('admin-content');
  }

  // 更新 URL
  window.location.hash = `#/${pageId}`;
}

/**
 * 初始化
 */
function init() {
  console.log('🚀 CorSight Console 初始化...');

  const initialPage = getRoute();

  // 初始化布局
  const layout = new AdminLayout('app', {
    activePage: initialPage,
    onNavigate: (pageId) => {
      navigateTo(pageId);
    },
  });

  // 加载初始页面
  navigateTo(initialPage);

  // 监听路由变化
  window.addEventListener('hashchange', () => {
    const pageId = getRoute();
    layout.sidebar.setActive(pageId);
    layout.header.updateTitle(pageId);
    navigateTo(pageId);
  });

  console.log('✅ CorSight Console 就绪');
}

// 启动
init();
