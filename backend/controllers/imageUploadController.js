/**
 * 图片上传控制器
 * POST /api/upload/image
 * GET  /api/upload/session/:sessionId
 */

const uploadSessionService = require('../services/uploadSessionService');
const imageStorageService = require('../services/imageStorageService');
const batchProcessorService = require('../services/batchProcessorService');
const SemanticTag = require('../models/SemanticTag');
const sseManager = require('../services/sseManager');

/**
 * 上传单张图片
 * multipart/form-data: { upload_session_id, bearing, image(file), description? }
 */
async function upload(req, res) {
  try {
    const { upload_session_id, bearing, description } = req.body;

    // 参数校验
    if (!upload_session_id) {
      return res.status(400).json({ success: false, error: 'missing_field', message: 'upload_session_id 必填' });
    }
    if (bearing === undefined || bearing === null) {
      return res.status(400).json({ success: false, error: 'missing_field', message: 'bearing 必填' });
    }
    // upload.any() 返回 req.files 数组（兼容 'image' 和 'file' 字段名）
    const file = req.files && req.files[0];
    if (!file) {
      return res.status(400).json({ success: false, error: 'missing_file', message: 'image 文件必填' });
    }

    const bearingNum = Number(bearing);
    if (isNaN(bearingNum) || bearingNum < 0 || bearingNum > 360) {
      return res.status(400).json({ success: false, error: 'invalid_bearing', message: 'bearing 必须为 0~360' });
    }

    // 查询 session
    const session = await uploadSessionService.getSession(upload_session_id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'invalid_session', message: 'session 不存在或已过期' });
    }
    if (['done', 'failed'].includes(session.status)) {
      return res.status(410).json({ success: false, error: 'session_finished', message: `session 已结束 (${session.status})` });
    }

    // 检查 bearing 是否在元数据中声明过（key 为整数，与 createSession 一致）
    // 容忍 ±1 误差：安卓端创建时发浮点 106.565→round=107，上传时发整数 106→round=106
    let bearingKey = String(Math.round(bearingNum));
    const imageKeys = session.images ? Object.keys(session.images) : [];
    if (!session.images || !session.images[bearingKey]) {
      // 尝试 ±1 容忍匹配
      const nearKey = imageKeys.find(k => Math.abs(Number(k) - Math.round(bearingNum)) <= 1);
      if (nearKey) {
        console.log(`[ImageUpload] bearing fuzzy match: requested=${bearingNum} key=${bearingKey} → matched=${nearKey}`);
        bearingKey = nearKey;
      } else {
        console.warn(`[ImageUpload] bearing mismatch: requested=${bearingNum} key=${bearingKey} available=[${imageKeys}]`);
        return res.status(400).json({
          success: false,
          error: 'invalid_bearing',
          message: `bearing ${bearingNum} 未在元数据中声明，可用: [${imageKeys}]`,
        });
      }
    }

    // 幂等处理：如果该 bearing 已上传过，先删除旧文件
    const existingEntry = session.images[bearingKey];
    if (existingEntry && existingEntry.uploaded && existingEntry.path) {
      imageStorageService.deleteImage(existingEntry.path);
    }

    // 保存图片到磁盘
    const imageUrl = imageStorageService.saveImage(
      session.point_id,
      bearingNum,
      file.buffer,
      file.mimetype
    );

    // 更新 session（用 bearingKey 而非原始 bearingNum，确保与 session 中的 key 一致）
    const progress = await uploadSessionService.markImageUploaded(upload_session_id, Number(bearingKey), imageUrl);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'invalid_session', message: 'session 更新失败' });
    }

    // 如果全部到齐，立即写入 semantic_tags（待分析状态），然后异步触发 VLM
    if (progress.is_complete) {
      await persistToSemanticTag(session);
      setImmediate(() => {
        batchProcessorService.checkAndTriggerBatch(upload_session_id).catch((err) => {
          console.error('[ImageUploadController] Batch trigger error:', err);
        });
      });
    }

    // 广播整体上传进度
    sseManager.broadcast({
      event: 'upload_progress',
      point_id: session.point_id,
      bearing: bearingKey,
      uploaded_count: progress.uploaded_count,
      total_count: progress.total_count,
      is_complete: !!progress.is_complete,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      bearing: bearingNum,
      uploaded_count: progress.uploaded_count,
      total_count: progress.total_count,
      message: `图片上传成功，当前已上传 ${progress.uploaded_count}/${progress.total_count} 张`,
    });
  } catch (err) {
    if (err.code === 'INVALID_BEARING') {
      return res.status(400).json({ success: false, error: 'invalid_bearing', message: err.message });
    }
    console.error('[ImageUploadController] Error:', err);
    return res.status(500).json({ success: false, error: 'server_error', message: '服务器内部错误' });
  }
}

/**
 * 查询上传进度
 * GET /api/upload/session/:sessionId
 */
async function getStatus(req, res) {
  try {
    const { sessionId } = req.params;
    const progress = await uploadSessionService.getProgress(sessionId);

    if (!progress) {
      return res.status(404).json({ success: false, error: 'invalid_session', message: 'session 不存在或已过期' });
    }

    return res.status(200).json({ success: true, ...progress });
  } catch (err) {
    console.error('[ImageUploadController] getStatus error:', err);
    return res.status(500).json({ success: false, error: 'server_error', message: '服务器内部错误' });
  }
}

/**
 * 上传完成后立即写入 semantic_tags（待 VLM 分析状态）
 * 不依赖 VLM，保证数据不丢失
 */
async function persistToSemanticTag(sessionDoc) {
  // sessionDoc 是 .lean() 返回的纯对象，images 是普通 object
  const images = sessionDoc.images || {};
  const imagesArray = [];

  for (const [bearingKey, img] of Object.entries(images)) {
    if (!img.uploaded || !img.path) continue;
    imagesArray.push({
      bearing: Number(bearingKey),
      fov: img.fov || 90,
      path: img.path,
      scene_type: null,
      osm_tags: {},
      description: '',
      confidence: 0,
    });
  }

  await SemanticTag.findOneAndUpdate(
    { point_id: sessionDoc.point_id },
    {
      $setOnInsert: {
        point_id: sessionDoc.point_id,
        location: sessionDoc.location,
        crs: sessionDoc.crs || 'GCJ02',
        scene_description: sessionDoc.scene_description || '',
        created_at: new Date(),
      },
      $set: {
        images: imagesArray,
        status: 'pending',
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );
  console.log(`[ImageUpload] Persisted ${imagesArray.length} images to semantic_tags (point_id=${sessionDoc.point_id})`);
}

module.exports = { upload, getStatus };
