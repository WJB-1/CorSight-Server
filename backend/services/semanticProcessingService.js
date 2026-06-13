/**
 * 异步语义处理 Worker
 *
 * 职责：
 * 1. 图片上传完成 → 收集图片路径 → 预留 VLM 分析占位 → 写入 SemanticTag
 * 2. 累积标签达到阈值 → 触发 OSM 注入 + GraphHopper 重建
 *
 * 当前状态：VLM 分析为占位（tags 为空），数据通道已完整。
 */

const UploadSession = require('../models/UploadSession');
const SemanticTag = require('../models/SemanticTag');
const config = require('../config/envConfig');

// 延迟加载，避免循环依赖（这两个 service 在注入阶段才需要）
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
 * 处理已完成上传的 session
 * @param {string} sessionId
 */
async function processCompleteUpload(sessionId) {
  console.log(`[SemanticWorker] Start processing session: ${sessionId}`);

  try {
    // 1. 获取 session 并验证状态
    const session = await UploadSession.findOne({ session_id: sessionId });
    if (!session || session.status !== 'complete') {
      console.warn(`[SemanticWorker] Session ${sessionId} not ready (status: ${session?.status})`);
      return;
    }

    // 2. 标记为处理中
    session.status = 'processing';
    session.updated_at = new Date();
    await session.save();

    // 3. 收集已上传的图片路径
    const imagePaths = [];
    const bearingDescriptions = {};
    for (const [bearing, img] of session.images) {
      if (img.uploaded && img.path) {
        imagePaths.push(img.path);
        if (img.description) {
          bearingDescriptions[bearing] = img.description;
        }
      }
    }

    // 4. 【占位】VLM 分析
    // TODO: 接入 LLM 视觉分析
    // const vlmResults = await vlmService.analyze(session.point_id, imagePaths, session.location, bearingDescriptions);
    const tags = {}; // VLM 占位：待接入后替换

    console.log(
      `[SemanticWorker] VLM placeholder — ${imagePaths.length} images for ${session.point_id}`
    );

    // 5. 写入永久语义标签
    await SemanticTag.findOneAndUpdate(
      { point_id: session.point_id },
      {
        point_id: session.point_id,
        location: session.location,
        tags,
        images: imagePaths,
        scene_description: session.scene_description,
        status: 'pending', // 等待 OSM 注入
        created_at: new Date(),
      },
      { upsert: true, new: true }
    );

    // 6. 标记 session 完成
    session.status = 'done';
    session.updated_at = new Date();
    await session.save();

    console.log(`[SemanticWorker] Session ${sessionId} done → semantic_tag saved as pending`);

    // 7. 检查是否需要自动触发 OSM 注入
    await maybeTriggerInjection();
  } catch (err) {
    console.error(`[SemanticWorker] Failed to process session ${sessionId}:`, err);
    try {
      await UploadSession.findOneAndUpdate(
        { session_id: sessionId },
        { status: 'failed', updated_at: new Date() }
      );
    } catch (updateErr) {
      console.error(`[SemanticWorker] Failed to mark session as failed:`, updateErr);
    }
  }
}

/**
 * 检查 pending 标签数量，达到阈值则自动触发注入
 */
async function maybeTriggerInjection() {
  const threshold = config.osm.AUTO_INJECT_THRESHOLD;
  if (threshold <= 0) return; // 自动注入已禁用

  const pendingCount = await SemanticTag.countDocuments({ status: 'pending' });
  console.log(`[SemanticWorker] Pending tags: ${pendingCount}/${threshold}`);

  if (pendingCount >= threshold) {
    console.log(`[SemanticWorker] Threshold reached, triggering OSM injection...`);
    setImmediate(() => runInjectionPipeline().catch(console.error));
  }
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

  console.log(`[Pipeline] === Injection pipeline started ===`);

  // Step 1-5: OSM 补丁生成 + 应用 + PBF 生成
  const injectionResult = await patchService.runInjection(options);
  console.log(`[Pipeline] Injection result:`, injectionResult);

  // Step 6: GraphHopper 重建（如果注入了实际内容且未跳过）
  let rebuildResult = { skipped: true };
  if (injectionResult.patched > 0 && !options.skipRebuild) {
    console.log(`[Pipeline] Triggering GraphHopper rebuild...`);
    try {
      const pbfPath = require('path').join(
        config.osm.OSM_DATA_DIR,
        config.osm.OSM_WORKSPACE_PBF
      );
      await ghService.rebuild(pbfPath);
      rebuildResult = { success: true, url: ghService.getActiveUrl() };
      console.log(`[Pipeline] GraphHopper rebuild complete`);
    } catch (err) {
      rebuildResult = { success: false, error: err.message };
      console.error(`[Pipeline] GraphHopper rebuild failed:`, err.message);
    }
  }

  console.log(`[Pipeline] === Injection pipeline finished ===`);
  return { injection: injectionResult, rebuild: rebuildResult };
}

module.exports = {
  processCompleteUpload,
  runInjectionPipeline,
  maybeTriggerInjection,
};
