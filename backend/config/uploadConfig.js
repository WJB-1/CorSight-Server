/**
 * 上传相关配置
 */

const path = require('path');

module.exports = {
  /** 图片存储目录 — 必须与 server.js 中 express.static('/images') 指向的目录一致
   *  __dirname = backend/config → .. = backend → ../.. = 项目根 → shared/images */
  UPLOAD_DIR: path.resolve(__dirname, '..', '..', 'shared', 'images'),

  /** 图片 URL 前缀（静态文件 serve 路径） */
  UPLOAD_URL_PREFIX: '/images',

  /** 单文件大小上限 (bytes) */
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB

  /** session 过期时间 (小时) */
  SESSION_TTL_HOURS: 24,

  /** 允许的 MIME 类型 */
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png'],
};
