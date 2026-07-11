/**
 * 文物讲解控制器
 */

const heritageService = require('../services/heritageService');

// POST /api/heritage/narrate
// Body: { annotation_id, mode, extra }
// mode: 'welcome' | 'detail' | 'story' | 'path'
async function narrate(req, res) {
  try {
    const { annotation_id, mode, extra } = req.body;

    if (!annotation_id) {
      return res.status(400).json({ success: false, message: 'annotation_id 为必填' });
    }

    const result = await heritageService.generateNarration(
      annotation_id,
      mode || 'welcome',
      extra || {}
    );

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Heritage] narrate error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/heritage/nearest
// Body: { lat, lng, radius? }
// 返回最近的 POI/Path 节点及其知识图谱
async function nearest(req, res) {
  try {
    const { lat, lng, radius } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'lat 和 lng 为必填' });
    }

    const result = await heritageService.findNearest(lat, lng, radius || 50);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Heritage] nearest error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/heritage/identify
// Body: { image_base64, lat, lng }
// VLM 识别照片中的文物 + 匹配最近 POI
async function identify(req, res) {
  try {
    const { image_base64, lat, lng } = req.body;

    if (!image_base64) {
      return res.status(400).json({ success: false, message: 'image_base64 为必填' });
    }

    const result = await heritageService.identifyByVision(image_base64, lat, lng);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Heritage] identify error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { narrate, nearest, identify };
