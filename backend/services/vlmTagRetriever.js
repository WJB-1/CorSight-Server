/**
 * VLM 标签检索服务
 *
 * 从 ragRetrievalService 中提取。
 * 查询 MongoDB semantic_tags，按行进方向筛选前方扇区标签。
 */

const SemanticTag = require('../models/SemanticTag');
const viewSectorService = require('./viewSectorService');

/**
 * 检索采样点附近的 VLM 富标签
 * @param {[number,number]} coord - [lng, lat]
 * @param {number} routeBearing - 行进方向（度）
 * @param {number} [radiusM=100] - 检索半径（米）
 * @returns {Promise<{found, tags, description, confidence, point_id}>}
 */
async function retrieveVlmTags(coord, routeBearing, radiusM = 100) {
  const [lng, lat] = coord;

  try {
    const tag = await SemanticTag.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusM,
        },
      },
      status: { $in: ['pending', 'patched'] },
    }).lean();

    if (!tag || !tag.images || tag.images.length === 0) {
      return { found: false, tags: {}, description: '', confidence: 0, point_id: null };
    }

    // 按行进方向筛选前方扇区内的图片标签
    const relevantImages = tag.images.filter((img) =>
      viewSectorService.isVisibleFromRoute(routeBearing, img.bearing, img.fov || 90)
    );

    if (relevantImages.length === 0) {
      return {
        found: true,
        tags: tag.merged_osm_tags || {},
        description: tag.merged_description || '',
        confidence: 0,
        point_id: tag.point_id,
      };
    }

    const mergedTags = {};
    const descriptions = [];
    let totalConfidence = 0;
    let count = 0;

    for (const img of relevantImages) {
      if (img.osm_tags) Object.assign(mergedTags, img.osm_tags);
      if (img.description) descriptions.push(img.description);
      if (img.confidence) { totalConfidence += img.confidence; count++; }
    }

    return {
      found: true,
      tags: mergedTags,
      description: descriptions.join('；'),
      confidence: count > 0 ? totalConfidence / count : 0,
      point_id: tag.point_id,
    };
  } catch (err) {
    console.warn(`[VLM-Tag] Retrieval error at (${lng},${lat}):`, err.message);
    return { found: false, tags: {}, description: '', confidence: 0, point_id: null };
  }
}

module.exports = { retrieveVlmTags };
