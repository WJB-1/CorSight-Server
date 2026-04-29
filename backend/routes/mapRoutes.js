const express = require('express');
const router = express.Router();
const corsightService = require('../services/corsightService');

/**
 * 地图路由
 * 提供空间数据查询相关接口
 */

/**
 * GET /api/navigation/nearby
 * 查询指定位置附近的采样点
 * 
 * Query Params:
 * - lat (required): 纬度
 * - lon (required): 经度
 * - radius (optional): 搜索半径，默认 50 米
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "total_count": 1,
 *     "points": [...]
 *   }
 * }
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lon, radius } = req.query;

    // 验证必填参数
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: lat and lon are required'
      });
    }

    // 解析并验证数值
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const searchRadius = radius ? parseFloat(radius) : 50;

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters: lat and lon must be valid numbers'
      });
    }

    if (radius && (isNaN(searchRadius) || searchRadius <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameter: radius must be a positive number'
      });
    }

    // 调用服务层查询
    const points = await corsightService.getNearbyPoints(
      latitude,
      longitude,
      searchRadius
    );

    // 返回标准格式响应
    res.json({
      success: true,
      data: {
        total_count: points.length,
        points: points
      }
    });

  } catch (error) {
    console.error('Error in /api/navigation/nearby:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/navigation/point/:pointId
 * 根据 ID 获取单个采样点详情
 */
router.get('/point/:pointId', async (req, res) => {
  try {
    const { pointId } = req.params;

    const point = await corsightService.getPointById(pointId);

    if (!point) {
      return res.status(404).json({
        success: false,
        error: 'Point not found'
      });
    }

    res.json({
      success: true,
      data: point
    });

  } catch (error) {
    console.error('Error in /api/navigation/point/:pointId:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;