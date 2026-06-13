/**
 * 异步语义处理 Worker
 * - 当所有图片上传完成后触发
 * - 当前为占位实现（VLM 分析待接入）
 * - 写入 SemanticTag 永久存储
 */

const UploadSession = require('../models/UploadSession');
const SemanticTag = require('../models/SemanticTag');

/**
 * 处理已完成上传的 session（异步调用，不阻塞请求）
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
    for (const [, img] of session.images) {
      if (img.uploaded && img.path) {
        imagePaths.push(img.path);
      }
    }

    // 4. 【占位】VLM 分析 — 后续接入 LLM
    // const vlmResults = await vlmService.analyze(session.point_id, imagePaths, session.location);
    const tags = {}; // 占位空标签

    console.log(
      `[SemanticWorker] VLM analysis placeholder — ${imagePaths.length} images for point ${session.point_id}`
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
        created_at: new Date(),
      },
      { upsert: true, new: true }
    );

    // 6. 标记 session 完成
    session.status = 'done';
    session.updated_at = new Date();
    await session.save();

    console.log(`[SemanticWorker] Session ${sessionId} done. Saved ${imagePaths.length} images to semantic_tags.`);
  } catch (err) {
    console.error(`[SemanticWorker] Failed to process session ${sessionId}:`, err);

    // 标记失败
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

module.exports = { processCompleteUpload };
