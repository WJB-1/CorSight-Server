/**
 * 控制台模块 — 实时日志展示
 *
 * 通过 polling 定期获取后端日志（后续可改为 SSE）
 * 当前实现：轮询 /health + 在前端记录请求日志
 */

const consoleBody = document.getElementById('console-body');
const btnClear = document.getElementById('btn-console-clear');

const MAX_LINES = 500;
let lineCount = 0;

export function initConsole() {
  btnClear.addEventListener('click', clearLogs);
}

/**
 * 添加一行日志
 */
export function addLog(entry) {
  const time = new Date().toLocaleTimeString('zh-CN');
  const method = entry.method || '';
  const path = entry.path || '';
  const status = entry.status || '';
  const duration = entry.duration || '';

  const methodClass = method;
  const statusClass = status >= 500 ? 's5xx' : status >= 400 ? 's4xx' : 's2xx';

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="time">${time}</span>
    <span class="method ${methodClass}">${method}</span>
    <span class="path">${path}</span>
    ${status ? `<span class="status ${statusClass}">${status}</span>` : ''}
    ${duration ? `<span class="duration">${duration}ms</span>` : ''}
  `;

  consoleBody.appendChild(line);
  lineCount++;

  // 限制最大行数
  while (lineCount > MAX_LINES) {
    consoleBody.removeChild(consoleBody.firstChild);
    lineCount--;
  }

  // 自动滚动到底部
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

/**
 * 添加纯文本日志
 */
export function addTextLog(text, type = 'info') {
  const time = new Date().toLocaleTimeString('zh-CN');
  const colors = { info: '#8b949e', warn: '#f0883e', error: '#f85149', success: '#3fb950' };
  const color = colors[type] || '#8b949e';

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="time">${time}</span><span style="color:${color}">${text}</span>`;

  consoleBody.appendChild(line);
  lineCount++;
  while (lineCount > MAX_LINES) {
    consoleBody.removeChild(consoleBody.firstChild);
    lineCount--;
  }
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

/**
 * 拦截 fetch 请求，在控制台记录
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
      addLog({ method, path: url.replace(window.location.origin, ''), status: res.status, duration });
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      addLog({ method, path: url.replace(window.location.origin, ''), status: 'ERR', duration });
      throw err;
    }
  };
}

function clearLogs() {
  consoleBody.innerHTML = '';
  lineCount = 0;
}
