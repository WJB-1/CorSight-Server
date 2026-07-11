/**
 * 标注控制器
 */

const annotationService = require('../services/annotationService');

// GET /api/annotations?west=&south=&east=&north=&category=&node_type=
async function getAnnotations(req, res) {
  try {
    const { west, south, east, north, category, node_type } = req.query;

    let data;
    if (west && south && east && north) {
      data = await annotationService.getByBbox(
        parseFloat(west), parseFloat(south), parseFloat(east), parseFloat(north),
        { category, node_type }
      );
    } else {
      data = await annotationService.getAll({ category, node_type });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('[Annotation] getAnnotations error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/annotations
async function createAnnotation(req, res) {
  try {
    const { type, geometry, node_type, point_id, category, label, description, zoom } = req.body;

    if (!type || !geometry) {
      return res.status(400).json({ success: false, message: 'type 和 geometry 为必填' });
    }

    const doc = await annotationService.create({
      type,
      geometry,
      node_type: node_type || 'poi',
      point_id: point_id || null,
      category: category || 'heritage',
      label: label || '',
      description: description || '',
      zoom: zoom || null,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error('[Annotation] createAnnotation error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// PUT /api/annotations/:id
async function updateAnnotation(req, res) {
  try {
    const { id } = req.params;
    const doc = await annotationService.update(id, req.body);
    if (!doc) {
      return res.status(404).json({ success: false, message: '标注不存在' });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error('[Annotation] updateAnnotation error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/annotations/:id
async function deleteAnnotation(req, res) {
  try {
    const { id } = req.params;
    const doc = await annotationService.softDelete(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: '标注不存在' });
    }
    res.json({ success: true, message: '已删除' });
  } catch (err) {
    console.error('[Annotation] deleteAnnotation error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/annotations/:id
async function getAnnotationById(req, res) {
  try {
    const { ObjectId } = require('mongoose').Types;
    const doc = await require('../services/annotationService').getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '标注不存在' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAnnotations, getAnnotationById, createAnnotation, updateAnnotation, deleteAnnotation };
