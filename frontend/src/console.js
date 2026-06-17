/**
 * 控制台模块 — 后端日志实时展示
 *
 * 双通道日志：
 * 1. SSE 通道：连接 GET /api/logs/stream，接收后端所有日志
 *    - type: 'log'      → console.log/warn/error 输出
 *    - type: 'request'  → HTTP 请求 method/url/status/duration
 *    - type: 'connected'→ 连接确认
 * 2. 前端拦截：拦截 window.fetch，记录前端发出的请求（补充）
 */

const consoleBody = document.getElementById('console-body');
const btnClear = document.getElementById('btn-console-clear');

const MAX_LINES = 500;
let logSource = null; // EventSource 实例
let retryCount = 0;
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY = 3000;

/**
 * 初始化控制台
 */
export function initConsole() {
  btnClear.addEventListener('click', clearLogs);
  connectLogSSE();
}

/**
 * 连接后端日志 SSE 流（指数退避重连，最多 MAX_RETRIES 次）
 */
function connectLogSSE() {
  const baseUrl = window.API_BASE_URL || '';
  const url = `${baseUrl}/api/logs/stream`;

  logSource = new EventSource(url);

  logSource.onmessage = (e) => {
    retryCount = 0; // 收到消息就重置重连计数
    try {
      const data = JSON.parse(e.data);

      if (data.type === 'connected') {
        renderLine({
          kind: 'system',
          message: '✓ 后端日志流已连接',
          level: 'success',
        });
      } else if (data.type === 'log') {
        renderLine({
          kind: 'backend-log',
          level: data.level,
          message: data.message,
          timestamp: data.timestamp,
        });
      } else if (data.type === 'request') {
        renderLine({
          kind: 'backend-request',
          method: data.method,
          url: data.url,
          status: data.status,
          duration: data.duration,
          timestamp: data.timestamp,
        });
      }
    } catch (_) {}
  };

  logSource.onerror = () => {
    logSource.close();
    logSource = null;

    retryCount++;
    if (retryCount > MAX_RETRIES) {
      renderLine({
        kind: 'system',
        message: `⚠ 日志流重连失败（已尝试 ${MAX_RETRIES} 次），点击"清除"按钮可重新连接`,
        level: 'error',
      });
      return;
    }

    const delay = Math.min(BASE_RETRY_DELAY * Math.pow(1.5, retryCount - 1), 30000);
    const seconds = Math.round(delay / 1000);
    renderLine({
      kind: 'system',
      message: `⚠ 后端日志流断开，${seconds} 秒后重连 (${retryCount}/${MAX_RETRIES})...`,
      level: 'warn',
    });
    setTimeout(connectLogSSE, delay);
  };
}

// ── 渲染 ─────────────────────────────────────────

function renderLine(entry) {
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString('zh-CN')
    : new Date().toLocaleTimeString('zh-CN');

  const line = document.createElement('div');
  line.className = 'log-line';

  if (entry.kind === 'backend-request') {
    // HTTP 请求日志
    const methodClass = entry.method || '';
    const statusClass = typeof entry.status === 'number' ? (entry.status >= 500 ? 's5xx' : entry.status >= 400 ? 's4xx' : 's2xx') : 's5xx';
    line.innerHTML = `
      <span class="time">${time}</span>
      <span class="tag tag-request">HTTP</span>
      <span class="method ${methodClass}">${entry.method}</span>
      <span class="path">${entry.url}</span>
      <span class="status ${statusClass}">${entry.status}</span>
      <span class="duration">${entry.duration}ms</span>
    `;
  } else if (entry.kind === 'backend-log') {
    // console.log/warn/error 日志
    const colors = { info: '#8b949e', warn: '#f0883e', error: '#f85149' };
    const color = colors[entry.level] || '#8b949e';
    const levelTag = { info: 'LOG', warn: 'WARN', error: 'ERR' };
    const tagClass = { info: 'tag-log', warn: 'tag-warn', error: 'tag-error' };
    line.innerHTML = `
      <span class="time">${time}</span>
      <span class="tag ${tagClass[entry.level] || 'tag-log'}">${levelTag[entry.level] || 'LOG'}</span>
      <span style="color:${color};word-break:break-all">${escapeHtml(entry.message)}</span>
    `;
  } else if (entry.kind === 'system') {
    // 前端系统消息
    const colors = { success: '#3fb950', warn: '#f0883e', error: '#f85149', info: '#8b949e' };
    const color = colors[entry.level] || '#8b949e';
    line.innerHTML = `
      <span class="time">${time}</span>
      <span style="color:${color};font-style:italic">${entry.message}</span>
    `;
  }

  appendLine(line);
}

/**
 * 前端 fetch 拦截（补充 SSE 的盲区：前端自身的请求）
 */
export function installFetchLogger() {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = args[1]?.method || 'GET';
    const start = Date.now();

    try {
      const res = await originalFetch.apply(this, args);
      const duration = Date.now() - start;
      // 前端请求日志标记为 FRONT，和后端 HTTP 区分
      renderLine({
        kind: 'backend-request',
        method,
        url: url.replace(window.location.origin, ''),
        status: res.status,
        duration,
      });
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      renderLine({
        kind: 'backend-request',
        method,
        url: url.replace(window.location.origin, ''),
        status: 'ERR',
        duration,
      });
      throw err;
    }
  };
}

/**
 * 添加纯文本日志（供 main.js 初始化等使用）
 */
export function addTextLog(text, type = 'info') {
  renderLine({ kind: 'system', message: text, level: type });
}

// ── 工具函数 ─────────────────────────────────────

function appendLine(line) {
  consoleBody.appendChild(line);
  while (consoleBody.children.length > MAX_LINES) {
    consoleBody.removeChild(consoleBody.firstChild);
  }
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clearLogs() {
  consoleBody.innerHTML = '';
  // 清除后如果日志流已断开，尝试重连
  if (!logSource || logSource.readyState === EventSource.CLOSED) {
    retryCount = 0;
    connectLogSSE();
  }
}
