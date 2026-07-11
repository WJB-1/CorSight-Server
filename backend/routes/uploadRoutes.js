/**
 * 上传路由
 *
 * POST /metadata          — 创建上传 session（JSON）
 * POST /image             — 上传单张图片（multipart/form-data）
 * GET  /session/:sessionId — 查询上传进度
 */

const express = require('express');
const multer = require('multer');
const uploadConfig = require('../config/uploadConfig');
const metadataController = require('../controllers/metadataController');
const imageUploadController = require('../controllers/imageUploadController');

const router = express.Router();

// Multer 配置：内存存储，限制文件大小和类型
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadConfig.MAX_FILE_SIZE },
  fileFilter(req, file, cb) {
    if (uploadConfig.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}，仅接受 JPEG/PNG`));
    }
  },
});

// ── 路由 ──────────────────────────────────────────
router.post('/metadata', metadataController.create);
// 兼容安卓端（file）和前端（image）两种文件字段名
router.post('/image', upload.any(), imageUploadController.upload);
router.get('/session/:sessionId', imageUploadController.getStatus);

// multer 错误处理（文件过大、类型不支持等）
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: '文件大小超过限制',
      LIMIT_UNEXPECTED_FILE: '不支持的文件字段',
    };
    return res.status(400).json({
      success: false,
      error: err.code,
      message: messages[err.code] || err.message,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error: 'upload_error',
      message: err.message,
    });
  }
  next();
});

module.exports = router;
