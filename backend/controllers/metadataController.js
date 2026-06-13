/**
 * 元数据上传控制器
 * POST /api/upload/metadata
 */

const uploadSessionService = require('../services/uploadSessionService');

/**
 * 创建上传 session
 * @param {object} req.body - { point_id, location:{lat,lng}, scene_description?, images:[{bearing,description?}] }
 */
async function create(req, res) {
  try {
    const { point_id, location, images } = req.body;

    // 参数校验
    if (!point_id || typeof point_id !== 'string') {
      return res.status(400).json({ success: false, error: 'missing_field', message: 'point_id 必填' });
    }
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.status(400).json({ success: false, error: 'invalid_location', message: 'location 必须包含 lat 和 lng' });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: 'missing_images', message: 'images 数组不能为空' });
    }

    // 校验每个 bearing
    for (const img of images) {
      if (typeof img.bearing !== 'number' || img.bearing < 0 || img.bearing > 360) {
        return res.status(400).json({
          success: false,
          error: 'invalid_bearing',
          message: `bearing 必须为 0~360 的数字，收到: ${img.bearing}`,
        });
      }
    }

    const result = await uploadSessionService.createSession(req.body);

    return res.status(201).json({
      success: true,
      upload_session_id: result.session_id,
      message: '元数据已接收，请使用 session_id 上传图片',
    });
  } catch (err) {
    if (err.code === 'POINT_EXISTS') {
      return res.status(409).json({ success: false, error: 'point_id_exists', message: '该点已完成上传，不可重复' });
    }
    if (err.code === 'SESSION_ACTIVE') {
      return res.status(409).json({
        success: false,
        error: 'session_active',
        message: '该点存在未完成的上传 session',
        session_id: err.session_id,
      });
    }
    console.error('[MetadataController] Error:', err);
    return res.status(500).json({ success: false, error: 'server_error', message: '服务器内部错误' });
  }
}

module.exports = { create };
