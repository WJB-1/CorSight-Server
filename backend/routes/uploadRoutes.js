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
router.post('/image', upload.single('image'), imageUploadController.upload);
router.get('/session/:sessionId', imageUploadController.getStatus);

module.exports = router;
