/**
 * 批量处理服务
 *
 * 缓存池管理 → 场景分类 → 批量 VLM → 标签合并 → 写入 SemanticTag
 *
 * 流程：
 * 1. checkAndTriggerBatch(sessionId) — 上传完成后调用，检查触发条件
 * 2. processBatch(batchId) — 创建 BatchTask → 逐张场景分类 → 批量 VLM → 合并 → 入库
 */

const UploadSession = require('../models/UploadSession');
const BatchTask = require('../models/BatchTask');
const SemanticTag = require('../models/SemanticTag');
const viewSectorService = require('./viewSectorService');
const osmLookupService = require('./osmLookupService');
const sceneClassifier = require('./sceneClassifier');
const tagMergeService = require('./tagMergeService');
const vlmService = require('./vlmService');
const promptLoader = require('../prompts/promptLoader');

/**
 * 检查是否满足批量触发条件，满足则创建 batch 并启动处理
 * @param {string} sessionId
 * @returns {string|null} batchId 或 null
 */
async function checkAndTriggerBatch(sessionId) {
  const session = await UploadSession.findOne({ session_id: sessionId });
  if (!session || session.status !== 'complete') return null;

  const batchId = `B_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 标记 session 已进入批量队列
  session.status = 'batched';
  session.batch_id = batchId;
  session.updated_at = new Date();
  await session.save();

  const totalImages = Array.from(session.images.values()).filter((i) => i.uploaded).length;
  await BatchTask.create({
    batch_id: batchId,
    session_ids: [sessionId],
    total_images: totalImages,
    status: 'pending',
  });

  console.log(`[BatchProcessor] Batch ${batchId} created (${totalImages} images)`);

  // 异步处理
  setImmediate(() => {
    processBatch(batchId).catch((err) => {
      console.error(`[BatchProcessor] Batch ${batchId} failed:`, err);
    });
  });

  return batchId;
}

/**
 * 处理一个 batch 任务
 * @param {string} batchId
 */
async function processBatch(batchId) {
  const batch = await BatchTask.findOne({ batch_id: batchId });
  if (!batch) return;

  batch.status = 'processing';
  batch.updated_at = new Date();
  await batch.save();

  console.log(`[BatchProcessor] Processing batch ${batchId}...`);
  const t0 = Date.now();

  try {
    // ── Step 1: 逐张场景分类 ──────────────────────
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;

      const location = session.location.coordinates; // [lng, lat]
      const [lon, lat] = location;

      for (const [bearingKey, img] of session.images) {
        if (!img.uploaded || !img.path) continue;

        const bearing = Number(bearingKey);
        const fov = img.fov || 90;

        // 1a. 计算视野扇区
        const sector = viewSectorService.computeSector(lon, lat, bearing, fov);

        // 1b. 扇区内 OSM 元素检索
        let osmElements = [];
        try {
          osmElements = await osmLookupService.lookupInPolygon(sector.polygon);
        } catch (err) {
          console.warn(`[BatchProcessor] OSM lookup failed for ${sessionId}/${bearingKey}:`, err.message);
        }

        // 1c. 场景分类
        const classification = sceneClassifier.classify(osmElements);

        // 1d. 回写到 session
        img.scene_type = classification.scene_type;
        img.scene_context = classification.context;
        img.status = 'classified';
      }

      session.updated_at = new Date();
      await session.save();
    }

    console.log(`[BatchProcessor] Scene classification done for batch ${batchId}`);

    // ── Step 2: 构建 VLM 任务 ────────────────────
    const vlmTasks = [];
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;

      for (const [bearingKey, img] of session.images) {
        if (!img.uploaded || !img.path || img.status !== 'classified') continue;

        const sceneType = img.scene_type || 'generic';
        const customId = `${session.point_id}_${bearingKey}`;

        // 加载对应场景的提示词模板
        let prompt = '';
        try {
          prompt = promptLoader.load(sceneType, {
            point_id: session.point_id,
            bearing: bearingKey,
            osm_context: JSON.stringify(img.scene_context || {}),
          });
        } catch (err) {
          console.warn(`[BatchProcessor] Prompt load failed for ${sceneType}:`, err.message);
        }

        vlmTasks.push({
          custom_id: customId,
          sessionId,
          bearingKey,
          imagePath: img.path,
          prompt,
          sceneType,
        });
      }
    }

    // ── Step 3: 批量 VLM 推理 ─────────────────────
    console.log(`[BatchProcessor] Submitting ${vlmTasks.length} VLM tasks...`);
    const vlmResults = await vlmService.analyzeBatch(vlmTasks);

    // 建立 custom_id → result 映射
    const resultMap = new Map();
    for (const r of vlmResults) {
      resultMap.set(r.custom_id, r);
    }

    // ── Step 4: 回写 VLM 结果到 session ───────────
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;

      for (const [bearingKey, img] of session.images) {
        if (!img.uploaded || img.status !== 'classified') continue;

        const customId = `${session.point_id}_${bearingKey}`;
        const vlmResult = resultMap.get(customId);

        if (vlmResult) {
          img.scene_context = {
            ...img.scene_context,
            vlm_osm_tags: vlmResult.osm_tags || {},
            vlm_description: vlmResult.description || '',
            vlm_confidence: vlmResult.confidence || 0,
          };
          img.status = 'processed';
        }
      }

      // ── Step 5: 标签合并 → 写入 SemanticTag ─────
      const imagesArray = [];
      for (const [bearingKey, img] of session.images) {
        if (!img.uploaded || !img.path) continue;
        imagesArray.push({
          bearing: Number(bearingKey),
          fov: img.fov || 90,
          path: img.path,
          scene_type: img.scene_type,
          osm_tags: (img.scene_context && img.scene_context.vlm_osm_tags) || {},
          description: (img.scene_context && img.scene_context.vlm_description) || '',
          confidence: (img.scene_context && img.scene_context.vlm_confidence) || 0,
        });
      }

      const merged = tagMergeService.mergeAll(imagesArray);

      await SemanticTag.findOneAndUpdate(
        { point_id: session.point_id },
        {
          point_id: session.point_id,
          location: session.location,
          scene_description: session.scene_description,
          images: imagesArray,
          merged_osm_tags: merged.osm_tags,
          merged_description: merged.description,
          status: 'pending',
          created_at: new Date(),
        },
        { upsert: true, new: true }
      );

      session.status = 'done';
      session.updated_at = new Date();
      await session.save();
    }

    // ── Step 6: 标记 batch 完成 ───────────────────
    batch.status = 'completed';
    batch.processed_images = batch.total_images;
    batch.updated_at = new Date();
    await batch.save();

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[BatchProcessor] Batch ${batchId} completed in ${elapsed}s`);
  } catch (err) {
    batch.status = 'failed';
    batch.error = err.message;
    batch.updated_at = new Date();
    await batch.save();
    throw err;
  }
}

/**
 * 查询待处理的 batch
 */
async function getPendingBatches() {
  return BatchTask.findPending();
}

/**
 * 查询 batch 详情
 */
async function getBatchDetail(batchId) {
  return BatchTask.findByBatchId(batchId);
}

/**
 * 手动触发所有 pending batch
 */
async function triggerPending() {
  const pending = await getPendingBatches();
  for (const batch of pending) {
    setImmediate(() => processBatch(batch.batch_id).catch(console.error));
  }
  return { triggered: pending.length };
}

module.exports = {
  checkAndTriggerBatch,
  processBatch,
  getPendingBatches,
  getBatchDetail,
  triggerPending,
};
