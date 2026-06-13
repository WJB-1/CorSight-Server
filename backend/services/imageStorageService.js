/**
 * 图片存储服务
 * - 保存 buffer 到磁盘，生成可控命名
 * - 删除图片（幂等）
 * - 确保上传目录存在
 */

const fs = require('fs');
const path = require('path');
const uploadConfig = require('../config/uploadConfig');

/**
 * 确保上传目录存在（启动时调用一次）
 */
function ensureUploadDir() {
  if (!fs.existsSync(uploadConfig.UPLOAD_DIR)) {
    fs.mkdirSync(uploadConfig.UPLOAD_DIR, { recursive: true });
    console.log(`[ImageStorage] Created upload dir: ${uploadConfig.UPLOAD_DIR}`);
  }
}

/**
 * 保存图片 buffer 到磁盘
 * @param {string} pointId
 * @param {number|string} bearing
 * @param {Buffer} fileBuffer
 * @param {string} mimeType - image/jpeg 或 image/png
 * @returns {string} 相对 URL，如 /images/P_xxx_45_123456.jpg
 */
function saveImage(pointId, bearing, fileBuffer, mimeType) {
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const timestamp = Date.now();
  const filename = `${pointId}_${bearing}_${timestamp}${ext}`;
  const fullPath = path.join(uploadConfig.UPLOAD_DIR, filename);

  fs.writeFileSync(fullPath, fileBuffer);

  return `${uploadConfig.UPLOAD_URL_PREFIX}/${filename}`;
}

/**
 * 删除图片文件（幂等，文件不存在不报错）
 * @param {string} imageUrl - 如 /images/P_xxx_45_123.jpg
 */
function deleteImage(imageUrl) {
  if (!imageUrl) return;

  // 从 URL 提取文件名
  const filename = path.basename(imageUrl);
  const fullPath = path.join(uploadConfig.UPLOAD_DIR, filename);

  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn(`[ImageStorage] Failed to delete ${fullPath}:`, err.message);
  }
}

module.exports = {
  ensureUploadDir,
  saveImage,
  deleteImage,
};
