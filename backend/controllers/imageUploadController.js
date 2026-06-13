/**
 * 图片上传控制器
 * POST /api/upload/image
 * GET  /api/upload/session/:sessionId
 */

const uploadSessionService = require('../services/uploadSessionService');
const imageStorageService = require('../services/imageStorageService');
const batchProcessorService = require('../services/batchProcessorService');

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
    if (!req.file) {
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

    // 检查 bearing 是否在元数据中声明过
    const bearingKey = String(bearingNum);
    if (!session.images || !session.images[bearingKey]) {
      return res.status(400).json({
        success: false,
        error: 'invalid_bearing',
        message: `bearing ${bearingNum} 未在元数据中声明`,
      });
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
      req.file.buffer,
      req.file.mimetype
    );

    // 更新 session
    const progress = await uploadSessionService.markImageUploaded(upload_session_id, bearingNum, imageUrl);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'invalid_session', message: 'session 更新失败' });
    }

    // 如果全部到齐，检查是否触发批量处理（不直接调 VLM）
    if (progress.is_complete) {
      setImmediate(() => {
        batchProcessorService.checkAndTriggerBatch(upload_session_id).catch((err) => {
          console.error('[ImageUploadController] Batch trigger error:', err);
        });
      });
    }

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

module.exports = { upload, getStatus };
