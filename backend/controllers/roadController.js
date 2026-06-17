/**
 * 道路标签控制器
 *
 * GET  /api/road/:osmId        — 获取道路完整标签（原始 + 增强）
 * POST /api/road/:osmId        — 创建/更新增强标签
 * DELETE /api/road/:osmId      — 删除增强标签
 * GET  /api/road/pending/list  — 查询所有待注入的增强标签
 */

const roadTagService = require('../services/roadTagService');

/**
 * 获取道路完整标签
 */
async function getTags(req, res) {
  try {
    const osmId = parseInt(req.params.osmId, 10);
    if (isNaN(osmId)) {
      return res.status(400).json({ success: false, message: 'osmId 必须是数字' });
    }
    const data = await roadTagService.getRoadTags(osmId);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[RoadController] getTags error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 创建/更新增强标签
 */
async function upsertTags(req, res) {
  try {
    const osmId = parseInt(req.params.osmId, 10);
    if (isNaN(osmId)) {
      return res.status(400).json({ success: false, message: 'osmId 必须是数字' });
    }
    const { tags, description } = req.body;
    if (!tags || typeof tags !== 'object') {
      return res.status(400).json({ success: false, message: 'tags 必须是对象' });
    }
    const doc = await roadTagService.upsertEnhancement(osmId, tags, description);
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error('[RoadController] upsertTags error:', err);
    return res.status(500).json({ success: false, message: '保存失败' });
  }
}

/**
 * 删除增强标签
 */
async function deleteTags(req, res) {
  try {
    const osmId = parseInt(req.params.osmId, 10);
    if (isNaN(osmId)) {
      return res.status(400).json({ success: false, message: 'osmId 必须是数字' });
    }
    const deleted = await roadTagService.deleteEnhancement(osmId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: '未找到增强标签' });
    }
    return res.json({ success: true, message: '已删除' });
  } catch (err) {
    console.error('[RoadController] deleteTags error:', err);
    return res.status(500).json({ success: false, message: '删除失败' });
  }
}

/**
 * 查询所有待注入的增强标签
 */
async function getPendingList(req, res) {
  try {
    const list = await roadTagService.findPending();
    return res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    console.error('[RoadController] getPendingList error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 按坐标精确查询所在位置的道路
 * GET /api/road/at?lng=113.33&lat=23.14
 */
async function getWayAt(req, res) {
  try {
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({ success: false, message: 'lng 和 lat 必填' });
    }

    const way = await roadTagService.findWayAtPoint(lng, lat);
    if (!way) {
      return res.json({ success: true, data: null, message: '该位置无道路' });
    }
    return res.json({ success: true, data: way });
  } catch (err) {
    console.error('[RoadController] getWayAt error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 按 bbox 查询 osm_ways，返回 GeoJSON（前端 MongoDB 道路图层用）
 * GET /api/road/geojson?minLng=113.1&minLat=23.0&maxLng=113.4&maxLat=23.3
 */
async function getGeoJSON(req, res) {
  try {
    const minLng = parseFloat(req.query.minLng);
    const minLat = parseFloat(req.query.minLat);
    const maxLng = parseFloat(req.query.maxLng);
    const maxLat = parseFloat(req.query.maxLat);
    const limit = parseInt(req.query.limit, 10) || 5000;

    if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
      return res.status(400).json({ success: false, message: 'minLng/minLat/maxLng/maxLat 必填' });
    }

    const geojson = await roadTagService.getWaysAsGeoJSON(minLng, minLat, maxLng, maxLat, limit);
    return res.json({ success: true, count: geojson.features.length, data: geojson });
  } catch (err) {
    console.error('[RoadController] getGeoJSON error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

module.exports = { getTags, upsertTags, deleteTags, getPendingList, getWayAt, getGeoJSON };
