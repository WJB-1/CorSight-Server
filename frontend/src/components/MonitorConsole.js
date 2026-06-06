/**
 * API 请求监控控制台组件
 * 实时显示后端 API 请求日志（通过 SSE）
 */

export class MonitorConsole {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.eventSource = null;
    this.logs = [];
    this.maxLogs = 100;
    this.filterMethod = 'all';
    this.filterStatus = 'all';
    this.autoScroll = true;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="monitor-console-wrapper" style="display:flex;flex-direction:column;height:100%;background:#0f0f23;border-radius:0 0 8px 8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#16213e;border-bottom:1px solid #333;">
          <span class="monitor-status" id="monitor-status">
            <span class="status-dot" style="width:8px;height:8px;border-radius:50%;background:#faad14;display:inline-block;animation:pulse 1.5s infinite;"></span>
            <span class="status-text" style="color:#e0e0e0;font-size:12px;margin-left:6px;">未连接</span>
          </span>
          <div style="display:flex;gap:12px;align-items:center;">
            <button class="btn btn-sm btn-secondary" id="monitor-connect" style="padding:4px 12px;font-size:12px;border:1px solid #444;background:#1a1a2e;color:#e0e0e0;border-radius:4px;cursor:pointer;">连接</button>
            <button class="btn btn-sm btn-secondary" id="monitor-clear" style="padding:4px 12px;font-size:12px;border:1px solid #444;background:#1a1a2e;color:#e0e0e0;border-radius:4px;cursor:pointer;">清空</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;padding:8px 16px;background:#0f0f23;border-bottom:1px solid #222;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <span style="color:#aaa;">方法:</span>
            <select id="monitor-filter-method" style="background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:3px 8px;font-size:12px;">
              <option value="all">全部</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;">
            <span style="color:#aaa;">状态:</span>
            <select id="monitor-filter-status" style="background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:3px 8px;font-size:12px;">
              <option value="all">全部</option>
              <option value="2xx">2xx 成功</option>
              <option value="4xx">4xx 错误</option>
              <option value="5xx">5xx 错误</option>
            </select>
          </div>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#aaa;cursor:pointer;margin-left:auto;">
            <input type="checkbox" id="monitor-autoscroll" checked> 自动滚动
          </label>
        </div>
        <div id="monitor-body" style="flex:1;overflow-y:auto;">
          <div id="monitor-log-list">
            <div style="text-align:center;padding:40px;color:#666;font-size:14px;">点击"连接"按钮开始监控</div>
          </div>
        </div>
        <div style="padding:8px 16px;background:#16213e;border-top:1px solid #333;font-size:12px;color:#888;text-align:right;">
          <span id="monitor-stats">0 条记录</span>
        </div>
      </div>
    `;

    this.elements = {
      connectBtn: this.container.querySelector('#monitor-connect'),
      logList: this.container.querySelector('#monitor-log-list'),
      filterMethod: this.container.querySelector('#monitor-filter-method'),
      filterStatus: this.container.querySelector('#monitor-filter-status'),
      clearBtn: this.container.querySelector('#monitor-clear'),
      autoScrollCheckbox: this.container.querySelector('#monitor-autoscroll'),
      statusDot: this.container.querySelector('.status-dot'),
      statusText: this.container.querySelector('.status-text'),
      stats: this.container.querySelector('#monitor-stats'),
      body: this.container.querySelector('#monitor-body')
    };
  }

  bindEvents() {
    this.elements.connectBtn.addEventListener('click', () => {
      if (this.eventSource) {
        this.disconnectSSE();
      } else {
        this.connectSSE();
      }
    });

    this.elements.filterMethod.addEventListener('change', (e) => {
      this.filterMethod = e.target.value;
      this.renderLogs();
    });

    this.elements.filterStatus.addEventListener('change', (e) => {
      this.filterStatus = e.target.value;
      this.renderLogs();
    });

    this.elements.clearBtn.addEventListener('click', () => {
      this.logs = [];
      this.renderLogs();
    });

    this.elements.autoScrollCheckbox.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });
  }

  connectSSE() {
    this.updateStatus('#faad14', '连接中...');
    this.elements.connectBtn.textContent = '断开';

    this.eventSource = new EventSource('/api/monitor/stream');

    this.eventSource.onopen = () => {
      this.updateStatus('#52c41a', '已连接');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'request') {
          this.addLog(message.data);
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    this.eventSource.onerror = () => {
      this.updateStatus('#f5222d', '连接断开');
      this.elements.connectBtn.textContent = '连接';
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    };
  }

  disconnectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.updateStatus('#94a3b8', '已断开');
    this.elements.connectBtn.textContent = '连接';
  }

  updateStatus(color, text) {
    this.elements.statusDot.style.background = color;
    this.elements.statusText.textContent = text;
    if (color === '#52c41a') {
      this.elements.statusDot.style.animation = 'none';
    } else if (color === '#faad14') {
      this.elements.statusDot.style.animation = 'pulse 1.5s infinite';
    } else {
      this.elements.statusDot.style.animation = 'none';
    }
  }

  addLog(logEntry) {
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    this.renderLogs();
  }

  getFilteredLogs() {
    return this.logs.filter(log => {
      if (this.filterMethod !== 'all' && log.method !== this.filterMethod) return false;
      if (this.filterStatus !== 'all') {
        const prefix = this.filterStatus.charAt(0);
        if (!String(log.statusCode).startsWith(prefix)) return false;
      }
      return true;
    });
  }

  renderLogs() {
    const filtered = this.getFilteredLogs();
    this.elements.stats.textContent = `${filtered.length} 条记录 / 共 ${this.logs.length} 条`;

    if (filtered.length === 0) {
      this.elements.logList.innerHTML = '<div style="text-align:center;padding:40px;color:#666;font-size:14px;">暂无记录</div>';
      return;
    }

    this.elements.logList.innerHTML = filtered.map(log => this.renderLogItem(log)).join('');

    if (this.autoScroll) {
      this.elements.body.scrollTop = 0;
    }
  }

  renderLogItem(log) {
    const statusClass = log.statusCode >= 200 && log.statusCode < 300 ? '#52c41a'
      : log.statusCode >= 400 && log.statusCode < 500 ? '#faad14'
      : log.statusCode >= 500 ? '#f5222d' : '#333';
    const methodColor = log.method === 'GET' ? '#1890ff'
      : log.method === 'POST' ? '#52c41a'
      : log.method === 'PUT' ? '#faad14'
      : log.method === 'DELETE' ? '#f5222d' : '#333';
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');

    return `
      <div style="border-bottom:1px solid #222;padding:10px 16px;font-size:12px;border-left:3px solid ${statusClass};transition:background 0.15s;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;padding:2px 8px;border-radius:3px;background:${methodColor};color:#fff;min-width:48px;text-align:center;font-size:11px;">${log.method}</span>
          <span style="color:#aaa;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${log.url}</span>
          <span style="font-weight:600;color:${statusClass};min-width:36px;text-align:right;">${log.statusCode}</span>
          <span style="color:#888;min-width:60px;text-align:right;">${log.duration}ms</span>
          <span style="color:#666;min-width:60px;text-align:right;">${time}</span>
        </div>
        ${log.requestBody ? `
          <div style="margin-top:4px;display:flex;gap:8px;">
            <span style="color:#666;font-size:11px;min-width:32px;">请求</span>
            <code style="background:#1a1a2e;padding:3px 8px;border-radius:4px;font-family:monospace;font-size:11px;color:#b0b0b0;flex:1;white-space:pre-wrap;word-break:break-all;max-height:60px;overflow-y:auto;">${this.escapeHtml(this.formatBody(log.requestBody))}</code>
          </div>
        ` : ''}
        ${log.responseBody ? `
          <div style="margin-top:4px;display:flex;gap:8px;">
            <span style="color:#666;font-size:11px;min-width:32px;">响应</span>
            <code style="background:#1a1a2e;padding:3px 8px;border-radius:4px;font-family:monospace;font-size:11px;color:#b0b0b0;flex:1;white-space:pre-wrap;word-break:break-all;max-height:60px;overflow-y:auto;">${this.escapeHtml(this.formatBody(log.responseBody))}</code>
          </div>
        ` : ''}
      </div>
    `;
  }

  formatBody(body) {
    if (typeof body === 'string') return body;
    try { return JSON.stringify(body, null, 2); } catch { return String(body); }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.disconnectSSE();
  }
}

export default MonitorConsole;
