/**
 * OSM 标签注入服务
 *
 * 职责：
 * 1. 编排注入流程（osmPatchService → graphHopperService）
 * 2. 自动阈值检查（pending 标签达到阈值时触发注入）
 *
 * 不再包含 VLM 处理逻辑（已移至 batchProcessorService）。
 */

const SemanticTag = require('../models/SemanticTag');
const config = require('../config/envConfig');
const path = require('path');

// 延迟加载，避免循环依赖
let osmPatchService = null;
let graphHopperService = null;

function getOsmPatchService() {
  if (!osmPatchService) osmPatchService = require('./osmPatchService');
  return osmPatchService;
}

function getGraphHopperService() {
  if (!graphHopperService) graphHopperService = require('./graphHopperService');
  return graphHopperService;
}

/**
 * 手动触发注入 + 重建流程
 * @param {object} options
 * @param {string[]} [options.pointIds] — 指定注入的 point_id 列表
 * @param {boolean} [options.skipRebuild=false] — 跳过 GraphHopper 重建
 * @returns {object} { injection, rebuild }
 */
async function runInjectionPipeline(options = {}) {
  const patchService = getOsmPatchService();
  const ghService = getGraphHopperService();

  console.log(`[Injection] === Pipeline started ===`);

  const injectionResult = await patchService.runInjection(options);
  console.log(`[Injection] Result:`, injectionResult);

  let rebuildResult = { skipped: true };
  if (injectionResult.patched > 0 && !options.skipRebuild) {
    console.log(`[Injection] Triggering GraphHopper rebuild...`);
    try {
      const pbfPath = path.join(config.osm.OSM_DATA_DIR, config.osm.OSM_WORKSPACE_PBF);
      await ghService.rebuild(pbfPath);
      rebuildResult = { success: true, url: ghService.getActiveUrl() };
      console.log(`[Injection] Rebuild complete`);
    } catch (err) {
      rebuildResult = { success: false, error: err.message };
      console.error(`[Injection] Rebuild failed:`, err.message);
    }
  }

  console.log(`[Injection] === Pipeline finished ===`);
  return { injection: injectionResult, rebuild: rebuildResult };
}

/**
 * 检查 pending 标签数量，达到阈值则自动触发注入
 */
async function maybeTriggerInjection() {
  const threshold = config.osm.AUTO_INJECT_THRESHOLD;
  if (threshold <= 0) return;

  const pendingCount = await SemanticTag.countDocuments({ status: 'pending' });
  console.log(`[Injection] Pending tags: ${pendingCount}/${threshold}`);

  if (pendingCount >= threshold) {
    console.log(`[Injection] Threshold reached, triggering...`);
    setImmediate(() => runInjectionPipeline().catch(console.error));
  }
}

module.exports = {
  runInjectionPipeline,
  maybeTriggerInjection,
};
