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
    this.connectSSE();
  }

  render() {
    this.container.innerHTML = `
      <div class="modal-content monitor-console-modal">
        <div class="modal-header monitor-header">
          <h3>📡 API 监控控制台</h3>
          <div class="monitor-header-actions">
            <span class="monitor-status" id="monitor-status">
              <span class="status-dot connecting"></span>
              <span class="status-text">连接中...</span>
            </span>
            <button class="modal-close" id="monitor-close">&times;</button>
          </div>
        </div>

        <div class="monitor-toolbar">
          <div class="monitor-filter">
            <label>方法:</label>
            <select id="monitor-filter-method">
              <option value="all">全部</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div class="monitor-filter">
            <label>状态:</label>
            <select id="monitor-filter-status">
              <option value="all">全部</option>
              <option value="2xx">2xx 成功</option>
              <option value="4xx">4xx 客户端错误</option>
              <option value="5xx">5xx 服务器错误</option>
            </select>
          </div>
          <button class="btn btn-sm btn-secondary" id="monitor-clear">
            🗑️ 清空
          </button>
          <label class="monitor-autoscroll">
            <input type="checkbox" id="monitor-autoscroll" checked>
            自动滚动
          </label>
        </div>

        <div class="monitor-body" id="monitor-body">
          <div class="monitor-log-list" id="monitor-log-list">
            <div class="monitor-empty">等待请求...</div>
          </div>
        </div>

        <div class="monitor-footer">
          <span id="monitor-stats">0 条记录</span>
        </div>
      </div>
    `;

    this.elements = {
      closeBtn: this.container.querySelector('#monitor-close'),
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
    this.elements.closeBtn.addEventListener('click', () => this.close());

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
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
    // 直接连接后端端口，绕过 vite 代理（SSE 长连接不被 vite 代理支持）
    const backendUrl = 'http://localhost:5741';
    this.eventSource = new EventSource(`${backendUrl}/api/monitor/stream`);

    this.eventSource.onopen = () => {
      this.updateStatus('connected', '已连接');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'request') {
          this.addLog(message.data);
        }
      } catch (err) {
        console.error('[Monitor] Parse error:', err);
      }
    };

    this.eventSource.onerror = () => {
      this.updateStatus('error', '连接断开');
    };
  }

  updateStatus(state, text) {
    this.elements.statusDot.className = `status-dot ${state}`;
    this.elements.statusText.textContent = text;
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
      if (this.filterMethod !== 'all' && log.method !== this.filterMethod) {
        return false;
      }
      if (this.filterStatus !== 'all') {
        const prefix = this.filterStatus.charAt(0);
        if (!String(log.statusCode).startsWith(prefix)) {
          return false;
        }
      }
      return true;
    });
  }

  renderLogs() {
    const filtered = this.getFilteredLogs();
    this.elements.stats.textContent = `${filtered.length} 条记录 / 共 ${this.logs.length} 条`;

    if (filtered.length === 0) {
      this.elements.logList.innerHTML = '<div class="monitor-empty">暂无记录</div>';
      return;
    }

    this.elements.logList.innerHTML = filtered.map(log => this.renderLogItem(log)).join('');

    if (this.autoScroll && this.isOpen) {
      this.elements.body.scrollTop = 0;
    }
  }

  renderLogItem(log) {
    const statusClass = this.getStatusClass(log.statusCode);
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');

    return `
      <div class="monitor-log-item ${statusClass}">
        <div class="log-row log-primary">
          <span class="log-method ${log.method}">${log.method}</span>
          <span class="log-url" title="${log.url}">${log.url}</span>
          <span class="log-status">${log.statusCode}</span>
          <span class="log-duration">${log.duration}ms</span>
          <span class="log-time">${time}</span>
        </div>
        ${log.requestBody ? `
          <div class="log-row log-body">
            <span class="log-label">请求:</span>
            <code class="log-code">${this.escapeHtml(this.formatBody(log.requestBody))}</code>
          </div>
        ` : ''}
        ${log.responseBody ? `
          <div class="log-row log-body">
            <span class="log-label">响应:</span>
            <code class="log-code">${this.escapeHtml(this.formatBody(log.responseBody))}</code>
          </div>
        ` : ''}
      </div>
    `;
  }

  getStatusClass(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return 'status-success';
    if (statusCode >= 400 && statusCode < 500) return 'status-warning';
    if (statusCode >= 500) return 'status-error';
    return '';
  }

  formatBody(body) {
    if (typeof body === 'string') return body;
    try {
      return JSON.stringify(body, null, 2);
    } catch {
      return String(body);
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  open() {
    this.isOpen = true;
    this.container.classList.add('active');
    document.body.style.overflow = 'hidden';
    this.renderLogs();
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('active');
    document.body.style.overflow = '';
  }

  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.close();
  }
}

export default MonitorConsole;
