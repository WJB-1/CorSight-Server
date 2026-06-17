/**
 * 批量处理服务（纯编排层）
 *
 * 职责：缓存池管理 + 编排 processBatch 流程
 * 实际工作委托给：
 *   sceneClassificationRunner — 逐图场景分类
 *   vlmTaskBuilder           — VLM 任务构建 + 结果回写
 *   vlmService               — VLM API 调用
 */

const UploadSession = require('../models/UploadSession');
const BatchTask = require('../models/BatchTask');
const { classifySessionImages } = require('./sceneClassificationRunner');
const { buildVlmTasks, writebackResults } = require('./vlmTaskBuilder');
const vlmService = require('./vlmService');

/**
 * 检查是否满足批量触发条件
 */
async function checkAndTriggerBatch(sessionId) {
  let session;
  try {
    session = await UploadSession.findOne({ session_id: sessionId });
    if (!session || session.status !== 'complete') return null;

    const batchId = `B_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

    console.log(`[Batch] Created ${batchId} (${totalImages} images)`);

    setImmediate(() => {
      processBatch(batchId).catch((err) => {
        console.error(`[Batch] ${batchId} failed:`, err);
      });
    });

    return batchId;
  } catch (err) {
    console.error(`[Batch] checkAndTriggerBatch failed for ${sessionId}:`, err.message);
    if (session && session.status === 'batched') {
      try {
        session.status = 'complete';
        session.batch_id = null;
        session.updated_at = new Date();
        await session.save();
      } catch (rollbackErr) {
        console.error(`[Batch] Rollback failed:`, rollbackErr.message);
      }
    }
    throw err;
  }
}

/**
 * 处理一个 batch 任务
 */
async function processBatch(batchId) {
  const batch = await BatchTask.findOne({ batch_id: batchId });
  if (!batch) return;

  batch.status = 'processing';
  batch.updated_at = new Date();
  await batch.save();

  const t0 = Date.now();
  console.log(`[Batch] Processing ${batchId}...`);

  try {
    // Step 1: 逐张场景分类
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;
      await classifySessionImages(session);
    }
    console.log(`[Batch] ${batchId} — classification done`);

    // Step 2: 构建 VLM 任务
    const allTasks = [];
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;
      allTasks.push(...buildVlmTasks(session));
    }

    // Step 3: 批量 VLM 推理
    console.log(`[Batch] ${batchId} — submitting ${allTasks.length} VLM tasks`);
    const vlmResults = await vlmService.analyzeBatch(allTasks);

    const resultMap = new Map();
    for (const r of vlmResults) resultMap.set(r.custom_id, r);

    // Step 4: 回写结果 + 持久化 SemanticTag
    for (const sessionId of batch.session_ids) {
      const session = await UploadSession.findOne({ session_id: sessionId });
      if (!session) continue;
      await writebackResults(session, resultMap);
    }

    // Step 5: 标记完成
    batch.status = 'completed';
    batch.processed_images = batch.total_images;
    batch.updated_at = new Date();
    await batch.save();

    console.log(`[Batch] ${batchId} completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
 * 触发所有 pending batch
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
