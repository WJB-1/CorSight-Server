/**
 * 语义标签查询服务
 *
 * 封装 SemanticTag Model 的所有查询操作，
 * 消除 Controller 直接依赖 Model 的分层违规。
 */

const SemanticTag = require('../models/SemanticTag');

/**
 * 查询所有采样点（前端地图标注用）
 */
async function findAll() {
  return SemanticTag.find({})
    .select('point_id location crs images merged_osm_tags merged_description status created_at')
    .lean();
}

/**
 * 查询待注入的标签
 */
async function findPending() {
  return SemanticTag.findPending();
}

/**
 * 标签状态统计
 */
async function countByStatus() {
  const [pending, patched, failed, total] = await Promise.all([
    SemanticTag.countDocuments({ status: 'pending' }),
    SemanticTag.countDocuments({ status: 'patched' }),
    SemanticTag.countDocuments({ status: 'failed' }),
    SemanticTag.countDocuments(),
  ]);
  return { total, pending, patched, failed };
}

/**
 * 按坐标查询最近的语义标签（$near 地理查询）
 * @param {[number,number]} coordinates - [lng, lat]
 * @param {number} [radiusM=100] - 检索半径（米）
 * @returns {Promise<object|null>}
 */
async function findNearby(coordinates, radiusM = 100) {
  return SemanticTag.findOne({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: radiusM,
      },
    },
  }).lean();
}

/**
 * 标记为已注入
 */
async function markPatched(pointId, osmInfo) {
  return SemanticTag.markPatched(pointId, osmInfo);
}

/**
 * 标记为失败
 */
async function markFailed(pointId, errorMsg) {
  return SemanticTag.markFailed(pointId, errorMsg);
}

module.exports = {
  findAll,
  findPending,
  findNearby,
  countByStatus,
  markPatched,
  markFailed,
};
