/**
 * 道路标签服务
 *
 * 职责：
 * 1. 查询 OSM 原始标签（osm_ways 集合）
 * 2. 查询/创建/更新/删除增强标签（road_tags 集合）
 * 3. 合并原始 + 增强标签返回给前端
 */

const mongoose = require('mongoose');
const RoadTag = require('../models/RoadTag');

/**
 * 获取道路的完整标签（原始 OSM + 用户增强）
 * @param {number} osmId
 * @returns {Promise<object>}
 */
async function getRoadTags(osmId) {
  const OsmWay = mongoose.connection.collection('osm_ways');
  const osmDoc = await OsmWay.findOne({ osm_id: osmId });
  const enhancement = await RoadTag.findOne({ osm_id: osmId }).lean();

  return {
    osm_id: osmId,
    osm_type: osmDoc?.osm_type || 'way',
    original_tags: osmDoc?.tags || {},
    enhanced_tags: enhancement?.tags || {},
    description: enhancement?.description || '',
    status: enhancement?.status || null,
    // 合并后的标签（增强覆盖原始）
    merged_tags: { ...(osmDoc?.tags || {}), ...(enhancement?.tags || {}) },
  };
}

/**
 * 创建或更新增强标签
 * @param {number} osmId
 * @param {object} tags — 要增强的标签
 * @param {string} description
 * @returns {Promise<object>}
 */
async function upsertEnhancement(osmId, tags, description) {
  const now = new Date();
  const doc = await RoadTag.findOneAndUpdate(
    { osm_id: osmId },
    {
      osm_id: osmId,
      osm_type: 'way',
      tags,
      description: description || '',
      status: 'pending',
      updated_at: now,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc.toObject();
}

/**
 * 删除增强标签
 * @param {number} osmId
 * @returns {boolean} 是否删除了
 */
async function deleteEnhancement(osmId) {
  const result = await RoadTag.deleteOne({ osm_id: osmId });
  return result.deletedCount > 0;
}

/**
 * 获取所有待注入的增强标签
 */
async function findPending() {
  return RoadTag.find({ status: 'pending' }).lean();
}

/**
 * 按 bbox 查询 osm_ways，返回 GeoJSON FeatureCollection
 * 用于前端 MongoDB 道路图层的动态加载
 *
 * @param {number} minLng
 * @param {number} minLat
 * @param {number} maxLng
 * @param {number} maxLat
 * @param {number} [limit=5000] — 最大返回数，防止过载
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
async function getWaysAsGeoJSON(minLng, minLat, maxLng, maxLat, limit = 5000) {
  const OsmWay = mongoose.connection.collection('osm_ways');

  const docs = await OsmWay.find({
    geometry: {
      $geoWithin: {
        $geometry: {
          type: 'Polygon',
          coordinates: [[
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat],
          ]],
        },
      },
    },
  }).limit(limit).toArray();

  const features = docs.map((doc) => ({
    type: 'Feature',
    geometry: doc.geometry,
    properties: {
      osm_id: doc.osm_id,
      highway: doc.tags?.highway || '',
      name: doc.tags?.['name:zh'] || doc.tags?.name || '',
      surface: doc.tags?.surface || '',
      footway: doc.tags?.footway || '',
      parent_way: doc.tags?.parent_way || null,
      ...(doc.tags || {}),
    },
  }));

  return { type: 'FeatureCollection', features };
}

module.exports = {
  getRoadTags,
  upsertEnhancement,
  deleteEnhancement,
  findPending,
  findWayAtPoint,
  getWaysAsGeoJSON,
};

/**
 * 按坐标精确查询所在位置的 way
 *
 * @param {number} lng
 * @param {number} lat
 * @returns {Promise<object|null>} 匹配的 way，无匹配返回 null
 */
async function findWayAtPoint(lng, lat) {
  const OsmWay = mongoose.connection.collection('osm_ways');

  const result = await OsmWay.findOne({
    geometry: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: 5,
      },
    },
  });

  if (!result) return null;

  return {
    osm_id: result.osm_id,
    osm_type: result.osm_type || 'way',
    tags: result.tags || {},
    highway: result.tags?.highway || '',
    name: result.tags?.['name:zh'] || result.tags?.name || '',
  };
}
