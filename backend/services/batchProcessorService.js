/**
 * 批量处理服务（缓存池管理 + 批量触发）
 *
 * 职责：
 * 1. 管理采集缓存池——接收已上传完成的 session
 * 2. 检查批量触发条件（数量/时间/手动）
 * 3. 创建 BatchTask → 逐张场景分类 → 批量 VLM → 标签合并 → 写入 SemanticTag
 *
 * 当前状态：T5 完整实现前的骨架版本
 */

const UploadSession = require('../models/UploadSession');
const BatchTask = require('../models/BatchTask');
const { generateSessionId } = require('../lib/idGenerator');

/**
 * 检查是否满足批量触发条件，满足则创建 batch 并启动处理
 * 在 imageUploadController 上传图片后调用
 *
 * @param {string} sessionId - 刚完成上传的 session
 */
async function checkAndTriggerBatch(sessionId) {
  const session = await UploadSession.findOne({ session_id: sessionId });
  if (!session || session.status !== 'complete') return;

  // 当前简化：只要 session complete 就立即触发（后续加阈值/定时器逻辑）
  console.log(`[BatchProcessor] Session ${sessionId} complete, creating batch...`);

  const batchId = `B_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 标记 session 已进入批量队列
  session.status = 'batched';
  session.batch_id = batchId;
  session.updated_at = new Date();
  await session.save();

  // 创建 batch 任务
  const totalImages = Array.from(session.images.values()).filter((i) => i.uploaded).length;
  await BatchTask.create({
    batch_id: batchId,
    session_ids: [sessionId],
    total_images: totalImages,
    status: 'pending',
  });

  console.log(`[BatchProcessor] Batch ${batchId} created (${totalImages} images), starting processing...`);

  // 异步处理（不阻塞请求）
  setImmediate(() => {
    processBatch(batchId).catch((err) => {
      console.error(`[BatchProcessor] Batch ${batchId} failed:`, err);
    });
  });

  return batchId;
}

/**
 * 处理一个 batch 任务
 * T5 完整实现前的占位骨架
 */
async function processBatch(batchId) {
  const batch = await BatchTask.findOne({ batch_id: batchId });
  if (!batch) return;

  batch.status = 'processing';
  batch.updated_at = new Date();
  await batch.save();

  // TODO T5: 场景分类 + VLM 调用 + 标签合并 + 写入 SemanticTag
  // 当前占位：直接把 session 图片写入 SemanticTag（无 VLM 分析）

  for (const sessionId of batch.session_ids) {
    const session = await UploadSession.findOne({ session_id: sessionId });
    if (!session) continue;

    // 收集图片路径
    const imagePaths = [];
    for (const [, img] of session.images) {
      if (img.uploaded && img.path) {
        imagePaths.push(img.path);
      }
    }

    // 写入 SemanticTag（占位：空标签）
    const SemanticTag = require('../models/SemanticTag');
    await SemanticTag.findOneAndUpdate(
      { point_id: session.point_id },
      {
        point_id: session.point_id,
        location: session.location,
        scene_description: session.scene_description,
        images: imagePaths.map((p, i) => ({
          bearing: 0, // TODO: 从 session 取真实 bearing
          fov: 90,
          path: p,
          scene_type: null,
          osm_tags: {},
          description: '',
        })),
        merged_osm_tags: {},
        merged_description: session.scene_description || '',
        status: 'pending',
        created_at: new Date(),
      },
      { upsert: true, new: true }
    );

    session.status = 'done';
    session.updated_at = new Date();
    await session.save();
  }

  batch.status = 'completed';
  batch.updated_at = new Date();
  await batch.save();

  console.log(`[BatchProcessor] Batch ${batchId} completed (placeholder)`);
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
 * 手动触发处理未完成的 batch
 */
async function triggerPending() {
  const pending = await getPendingBatches();
  for (const batch of pending) {
    setImmediate(() => {
      processBatch(batch.batch_id).catch(console.error);
    });
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
