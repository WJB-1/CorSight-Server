/**
 * 上传 Session 管理服务
 * - 创建 session、查询、标记图片已上传、判断是否完成
 */

const UploadSession = require('../models/UploadSession');
const SemanticTag = require('../models/SemanticTag');
const { generateSessionId } = require('../lib/idGenerator');
const uploadConfig = require('../config/uploadConfig');

/**
 * 创建上传 session
 * @param {object} metadata - { point_id, location:{lat,lng}, scene_description?, images:[{bearing,description?}] }
 * @returns {object} { session_id, status }
 * @throws {Error} point_id 已存在时抛出
 */
async function createSession(metadata) {
  const { point_id, location, crs, scene_description, images } = metadata;

  // 1. 检查 point_id 是否已在正式库中
  const existing = await SemanticTag.findOne({ point_id }).lean();
  if (existing) {
    const err = new Error('point_id already exists in semantic_tags');
    err.code = 'POINT_EXISTS';
    throw err;
  }

  // 2. 检查是否有未完成的 session
  const pendingSession = await UploadSession.findOne({
    point_id,
    status: { $nin: ['done', 'failed'] },
  }).lean();
  if (pendingSession) {
    const err = new Error('point_id has an active upload session');
    err.code = 'SESSION_ACTIVE';
    err.session_id = pendingSession.session_id;
    throw err;
  }

  // 3. 构建 images map：bearing → { fov, description, uploaded:false, path:null, ... }
  const imagesMap = {};
  for (const img of images) {
    imagesMap[String(img.bearing)] = {
      fov: img.fov || 90,
      description: img.description || '',
      uploaded: false,
      path: null,
      scene_type: null,
      scene_context: null,
      status: 'pending',
    };
  }

  // 4. 创建 session
  const sessionId = generateSessionId();
  const expireAt = new Date(Date.now() + uploadConfig.SESSION_TTL_HOURS * 3600 * 1000);

  const session = await UploadSession.create({
    session_id: sessionId,
    point_id,
    location: {
      type: 'Point',
      coordinates: [location.lng, location.lat],
    },
    crs: crs || 'GCJ02',
    scene_description: scene_description || '',
    images: imagesMap,
    status: 'metadata_received',
    expireAt,
  });

  return { session_id: session.session_id, status: session.status };
}

/**
 * 查询 session
 * @param {string} sessionId
 * @returns {object|null} session 文档
 */
async function getSession(sessionId) {
  return UploadSession.findOne({ session_id: sessionId }).lean();
}

/**
 * 标记某张图片已上传
 * @param {string} sessionId
 * @param {number|string} bearing
 * @param {string} imagePath - 存储的相对 URL
 * @returns {object} { status, uploadedCount, totalCount, isComplete }
 */
async function markImageUploaded(sessionId, bearing, imagePath) {
  const session = await UploadSession.findOne({ session_id: sessionId });
  if (!session) return null;

  const key = String(bearing);
  const entry = session.images.get(key);
  if (!entry) {
    const err = new Error(`bearing ${bearing} not declared in metadata`);
    err.code = 'INVALID_BEARING';
    throw err;
  }

  // 更新该 bearing 的状态
  entry.uploaded = true;
  entry.path = imagePath;
  session.images.set(key, entry);
  session.updated_at = new Date();

  // 计算进度
  let uploadedCount = 0;
  const totalCount = session.images.size;
  for (const [, img] of session.images) {
    if (img.uploaded) uploadedCount++;
  }

  // 更新整体状态
  const isComplete = uploadedCount === totalCount;
  session.status = isComplete ? 'complete' : 'partial_upload';

  await session.save();

  return {
    status: session.status,
    uploaded_count: uploadedCount,
    total_count: totalCount,
    is_complete: isComplete,
  };
}

/**
 * 查询 session 进度
 * @param {string} sessionId
 * @returns {object|null}
 */
async function getProgress(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const uploadedBearings = [];
  const pendingBearings = [];

  for (const [bearing, img] of Object.entries(session.images || {})) {
    if (img.uploaded) {
      uploadedBearings.push(Number(bearing));
    } else {
      pendingBearings.push(Number(bearing));
    }
  }

  return {
    session_id: session.session_id,
    point_id: session.point_id,
    status: session.status,
    total_images: Object.keys(session.images || {}).length,
    uploaded_bearings: uploadedBearings,
    pending_bearings: pendingBearings,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

module.exports = {
  createSession,
  getSession,
  markImageUploaded,
  getProgress,
};
