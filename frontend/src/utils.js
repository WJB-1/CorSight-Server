/**
 * 前端公共工具模块
 *
 * 职责：
 * - HTML 转义（防御 XSS）
 * - 安全 DOM 操作
 * - 通用 UI 工具
 */

// ── HTML 转义 ─────────────────────────────────────

/**
 * 转义 HTML 特殊字符，防止 XSS 注入
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的安全字符串
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 转义用于 HTML 属性值的字符串
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
  return escapeHtml(str);
}

// ── 安全 DOM 操作 ─────────────────────────────────

/**
 * 安全设置 innerHTML：所有动态数据通过 escapeHtml 转义后再拼接
 *
 * 用法：
 *   safeHtml(panel, `
 *     <h3>${esc(way.name)}</h3>
 *     <p>${esc(way.description)}</p>
 *   `);
 *
 * @param {HTMLElement} el
 * @param {string} html - 可包含 ${esc(...)} 模板的 HTML 字符串
 * @param {Object} bindings - 事件绑定描述 { '#btn': { click: handler } }
 */
export function safeHtml(el, html, bindings) {
  el.innerHTML = html;
  if (bindings) {
    for (const [selector, events] of Object.entries(bindings)) {
      const target = el.querySelector(selector);
      if (target) {
        for (const [event, handler] of Object.entries(events)) {
          target.addEventListener(event, handler);
        }
      }
    }
  }
}

// ── 防抖 ──────────────────────────────────────────

/**
 * 创建防抖函数
 * @param {Function} fn
 * @param {number} ms
 * @returns {{ run: Function, cancel: Function }}
 */
export function createDebounce(fn, ms) {
  let timer = null;
  return {
    run(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
    },
  };
}

// ── 可取消请求 ─────────────────────────────────────

/**
 * 创建可取消的 fetch 请求管理器
 *
 * 用法：
 *   const req = createCancellableFetch();
 *   const data = await req.fetch(url);  // 新请求自动取消上一次
 *   req.abort();                         // 手动取消
 */
export function createCancellableFetch() {
  let controller = null;

  return {
    async fetch(url, opts = {}) {
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        return res;
      } catch (err) {
        if (err.name === 'AbortError') return null; // 被取消，静默返回
        throw err;
      }
    },
    abort() {
      if (controller) {
        controller.abort();
        controller = null;
      }
    },
  };
}

// ── SSE 超时包装 ───────────────────────────────────

/**
 * 创建带超时和自动重连限制的 EventSource 包装器
 *
 * @param {string} url - SSE URL
 * @param {Object} opts
 * @param {number} [opts.timeout=60000] - 超时时间（ms）
 * @param {number} [opts.maxRetries=5] - 最大重连次数
 * @param {number} [opts.baseDelay=3000] - 重连基础延迟（ms）
 * @param {Function} [opts.onMessage] - 消息回调
 * @param {Function} [opts.onError] - 错误回调
 * @param {Function} [opts.onTimeout] - 超时回调
 * @param {Function} [opts.onRetryExhausted] - 重连次数耗尽回调
 * @returns {{ close: Function, isConnected: Function }}
 */
export function createSSEConnection(url, opts = {}) {
  const {
    timeout = 60000,
    maxRetries = 5,
    baseDelay = 3000,
    onMessage = () => {},
    onError = () => {},
    onTimeout = () => {},
    onRetryExhausted = () => {},
  } = opts;

  let source = null;
  let timeoutTimer = null;
  let retryCount = 0;
  let manuallyClosed = false;

  function resetTimeout() {
    clearTimeout(timeoutTimer);
    if (timeout > 0) {
      timeoutTimer = setTimeout(() => {
        if (source) {
          source.close();
          source = null;
        }
        onTimeout();
      }, timeout);
    }
  }

  function connect() {
    if (manuallyClosed) return;

    source = new EventSource(url);

    source.onmessage = (e) => {
      retryCount = 0; // 收到消息就重置重连计数
      resetTimeout();
      try {
        const data = JSON.parse(e.data);
        onMessage(data);
      } catch (_) {}
    };

    source.onerror = () => {
      source.close();
      source = null;
      clearTimeout(timeoutTimer);

      if (manuallyClosed) return;

      retryCount++;
      if (retryCount > maxRetries) {
        onRetryExhausted(retryCount);
        return;
      }

      const delay = Math.min(baseDelay * Math.pow(1.5, retryCount - 1), 30000);
      onError(retryCount, maxRetries, delay);
      setTimeout(connect, delay);
    };

    resetTimeout();
  }

  connect();

  return {
    close() {
      manuallyClosed = true;
      clearTimeout(timeoutTimer);
      if (source) {
        source.close();
        source = null;
      }
    },
    isConnected() {
      return source?.readyState === EventSource.OPEN;
    },
  };
}
