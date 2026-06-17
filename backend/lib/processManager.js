/**
 * 通用进程管理工具（纯函数）
 *
 * 从 graphHopperService 中提取的 OS 级操作。
 * 平台感知：Windows 用 netstat/taskkill，Linux 用 lsof/kill。
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * 查找并杀死占用指定端口的进程
 * @param {number} port
 */
async function killByPort(port) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat', ['-ano']);
      const lines = stdout.split('\n').filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          try { await execFileAsync('taskkill', ['/F', '/PID', pid]); } catch (_) {}
        }
      }
    } else {
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try { process.kill(Number(pid), 'SIGTERM'); } catch (_) {}
      }
    }
  } catch (_) {
    // 端口未被占用
  }
}

/**
 * 轮询 HTTP 端点直到返回 200
 * @param {string} url
 * @param {number} timeoutMs
 * @param {number} [intervalMs=5000]
 */
async function waitForHealth(url, timeoutMs = 600000, intervalMs = 5000) {
  const axios = require('axios');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await axios.get(`${url}/health`, { timeout: 3000 });
      if (resp.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Health check timeout after ${timeoutMs / 1000}s: ${url}`);
}

/**
 * 检查端口是否健康
 */
async function isHealthy(url) {
  try {
    const axios = require('axios');
    const resp = await axios.get(`${url}/health`, { timeout: 3000 });
    return resp.status === 200;
  } catch {
    return false;
  }
}

module.exports = { killByPort, waitForHealth, isHealthy };
