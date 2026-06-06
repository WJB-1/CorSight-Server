/**
 * API 监控页
 */

import { MonitorConsole } from '../components/MonitorConsole.js';

export class MonitorPage {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.monitorConsole = null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div style="height:calc(100vh - 120px);display:flex;flex-direction:column;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <div style="padding:16px 20px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;">
          <span style="font-size:16px;font-weight:700;color:#0f172a;">📡 API 请求实时监控</span>
          <span style="font-size:12px;color:#94a3b8;margin-left:12px;">点击"连接"按钮开始监控后端请求</span>
        </div>
        <div id="monitor-console-container" style="flex:1;overflow:hidden;"></div>
      </div>
    `;

    this.monitorConsole = new MonitorConsole('monitor-console-container');
  }

  destroy() {
    if (this.monitorConsole) {
      this.monitorConsole.destroy();
    }
  }
}

export default MonitorPage;
