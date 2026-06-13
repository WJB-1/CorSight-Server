/**
 * GraphHopper 引擎管理服务
 *
 * 当前实现：方案 A（简单重启）
 * 接口设计：方案 B 可扩展（strategy 模式）
 *
 * 所有方法都是幂等的，可安全重试。
 */

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const axios = require('axios');
const config = require('../config/envConfig');
const OsmWorkState = require('../models/OsmWorkState');

const execFileAsync = promisify(execFile);
const ghConfig = config.graphhopper;
const osmConfig = config.osm;

// ── 策略接口 ──────────────────────────────────────

/**
 * 策略接口定义（供方案 B 实现）
 *
 * @typedef {object} RebuildStrategy
 * @method rebuild(newPbfPath) — 执行重建
 * @method getActiveUrl() — 返回当前活跃的 GraphHopper URL
 * @method isReady() — 返回当前引擎是否可用
 */

// ── 方案 A：简单重启 ──────────────────────────────

const strategyA = {
  name: 'simple-restart',

  /**
   * 停止当前 GH → 更新 config → 启动新 GH → 等待就绪
   * @param {string} newPbfPath — 新的 PBF 文件绝对路径
   * @returns {string} GraphHopper URL
   */
  async rebuild(newPbfPath) {
    const state = await OsmWorkState.getState();

    if (state.rebuild_in_progress) {
      throw new Error('Rebuild already in progress');
    }

    state.rebuild_in_progress = true;
    state.pending_pbf = newPbfPath;
    await state.save();

    try {
      // 1. 停止当前 GraphHopper（如果在运行）
      await stopGraphHopper();
      console.log('[GraphHopper] Stopped current instance');

      // 2. 更新 config.yml 指向新 PBF
      updateConfigYml(newPbfPath);
      console.log(`[GraphHopper] Updated config.yml → ${path.basename(newPbfPath)}`);

      // 3. 清理旧缓存目录
      const cachePath = path.join(osmConfig.OSM_DATA_DIR, state.current_cache);
      if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath, { recursive: true, force: true });
        console.log(`[GraphHopper] Cleared old cache: ${state.current_cache}`);
      }

      // 4. 启动新实例
      await startGraphHopper();
      console.log('[GraphHopper] Starting new instance...');

      // 5. 等待就绪
      await waitForReady(ghConfig.GRAPHHOPPER_URL, 600000); // 10 分钟超时
      console.log('[GraphHopper] Instance ready');

      // 6. 更新状态
      state.current_pbf = path.basename(newPbfPath);
      state.pending_pbf = null;
      state.last_rebuild_time = new Date();
      state.rebuild_in_progress = false;
      await state.save();

      return ghConfig.GRAPHHOPPER_URL;
    } catch (err) {
      state.rebuild_in_progress = false;
      state.pending_pbf = null;
      await state.save().catch(() => {});
      throw err;
    }
  },

  getActiveUrl() {
    return ghConfig.GRAPHHOPPER_URL;
  },

  async isReady() {
    try {
      const resp = await axios.get(`${ghConfig.GRAPHHOPPER_URL}/health`, { timeout: 3000 });
      return resp.status === 200;
    } catch {
      return false;
    }
  },
};

// ── 方案 B 占位（预留接口） ───────────────────────

const strategyB = {
  name: 'ping-pong',

  async rebuild(newPbfPath) {
    // TODO: 实现双实例乒乓切换
    // 1. 在备用端口启动新实例
    // 2. 等待 /health 就绪
    // 3. 切换 GRAPHHOPPER_URL
    // 4. 停止旧实例
    throw new Error('Strategy B not yet implemented. Use strategy A.');
  },

  getActiveUrl() {
    return ghConfig.GRAPHHOPPER_URL;
  },

  async isReady() {
    return strategyA.isReady();
  },
};

// ── 当前使用的策略 ────────────────────────────────

let activeStrategy = strategyA;

/**
 * 切换重建策略（供未来扩展）
 * @param {'A'|'B'} strategyName
 */
function setStrategy(strategyName) {
  if (strategyName === 'B') {
    activeStrategy = strategyB;
  } else {
    activeStrategy = strategyA;
  }
  console.log(`[GraphHopper] Strategy set to: ${activeStrategy.name}`);
}

// ── 内部工具函数 ──────────────────────────────────

/**
 * 更新 config.yml 中的 datareader.file 路径
 */
function updateConfigYml(newPbfPath) {
  const configPath = osmConfig.GRAPHHOPPER_CONFIG;
  let content = fs.readFileSync(configPath, 'utf-8');

  // 替换 datareader.file 行
  content = content.replace(
    /datareader\.file:.*/,
    `datareader.file: ${newPbfPath.replace(/\\/g, '/')}`
  );

  fs.writeFileSync(configPath, content);
}

/**
 * 启动 GraphHopper 进程（后台 detached）
 */
async function startGraphHopper() {
  const jarPath = osmConfig.GRAPHHOPPER_JAR;
  const configPath = osmConfig.GRAPHHOPPER_CONFIG;
  const jarDir = path.dirname(jarPath);

  const child = spawn('java', ['-Xmx4g', '-jar', jarPath, 'server', configPath], {
    cwd: jarDir,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log(`[GraphHopper] Spawned PID: ${child.pid}`);
}

/**
 * 停止 GraphHopper（通过端口查找进程并 kill）
 * Windows 上用 taskkill，Linux 上用 lsof + kill
 */
async function stopGraphHopper() {
  const url = new URL(ghConfig.GRAPHHOPPER_URL);
  const port = url.port || '8989';

  try {
    if (process.platform === 'win32') {
      // Windows: netstat 找 PID → taskkill
      const { stdout } = await execFileAsync('netstat', ['-ano']);
      const lines = stdout.split('\n').filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          try {
            await execFileAsync('taskkill', ['/F', '/PID', pid]);
            console.log(`[GraphHopper] Killed PID ${pid}`);
          } catch { /* already dead */ }
        }
      }
    } else {
      // Linux/Mac: lsof -ti | xargs kill
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
      const pids = stdout.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM');
        } catch { /* already dead */ }
      }
    }
  } catch {
    // 端口没被占用，说明 GH 没在运行
    console.log(`[GraphHopper] No process on port ${port}`);
  }
}

/**
 * 等待 GraphHopper 就绪
 * @param {string} url
 * @param {number} timeoutMs
 */
async function waitForReady(url, timeoutMs = 600000) {
  const start = Date.now();
  const interval = 5000; // 每 5 秒检查一次

  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await axios.get(`${url}/health`, { timeout: 3000 });
      if (resp.status === 200) return true;
    } catch {
      // 还没启动
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`GraphHopper not ready after ${timeoutMs / 1000}s`);
}

// ── 导出 ──────────────────────────────────────────

module.exports = {
  /** 使用当前策略执行重建 */
  rebuild: (newPbfPath) => activeStrategy.rebuild(newPbfPath),
  /** 获取当前活跃的 GraphHopper URL */
  getActiveUrl: () => activeStrategy.getActiveUrl(),
  /** 检查引擎是否就绪 */
  isReady: () => activeStrategy.isReady(),
  /** 切换策略 A/B */
  setStrategy,
  /** 获取当前策略名称 */
  getStrategyName: () => activeStrategy.name,
  /** 直接暴露内部方法（供测试或手动操作） */
  stopGraphHopper,
  startGraphHopper,
  waitForReady,
};
