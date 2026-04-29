/**
 * 子模块 5.4: Radius Search Engine
 * 
 * 空间半径查询引擎
 * 为端云协同导航提供前置危险点查询能力
 * 
 * 接口端点：GET /api/navigation/nearby
 * 请求参数：lat (纬度), lon (经度), radius (搜索半径，默认 50，单位米)
 * 查询要求：使用 MongoDB 的 $nearSphere 操作符
 */

const express = require('express');
const { findNearbyPoints } = require('../models/SamplingPoint');

const router = express.Router();

/**
 * GET /api/navigation/nearby
 * 查找指定位置附近的采样点
 * 
 * 请求参数：
 * - lat: 纬度 (required)
 * - lon: 经度 (required)
 * - radius: 搜索半径，单位米 (optional, default: 50)
 */
router.get('/nearby', async (req, res) => {
  try {
    // 1. 提取并验证参数
    const { lat, lon, radius } = req.query;
    
    // 验证必需参数
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数：lat (纬度) 和 lon (经度)'
      });
    }
    
    // 转换为数字
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const searchRadius = radius ? parseInt(radius, 10) : 50;
    
    // 验证数值有效性
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        message: '经纬度必须是有效的数字'
      });
    }
    
    // 验证经纬度范围
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: '纬度必须在 -90 到 90 之间'
      });
    }
    
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: '经度必须在 -180 到 180 之间'
      });
    }
    
    // 验证半径
    if (isNaN(searchRadius) || searchRadius <= 0 || searchRadius > 10000) {
      return res.status(400).json({
        success: false,
        message: '搜索半径必须是 1-10000 之间的整数（单位：米）'
      });
    }
    
    console.log(`[Navigation] 查询附近采样点: 中心(${latitude}, ${longitude}), 半径${searchRadius}m`);
    
    // 2. 执行地理空间查询
    const nearbyPoints = await findNearbyPoints(latitude, longitude, searchRadius);
    
    // 3. 处理返回结果 - 按距离由近到远排序（MongoDB $nearSphere 已经帮我们做了）
    const formattedPoints = nearbyPoints.map((point, index) => {
      // 计算大致距离（米）- 用于显示
      // 注意：这是简化计算，实际距离由 MongoDB 在查询时计算
      const pointLat = point.location.coordinates[1];
      const pointLon = point.location.coordinates[0];
      const distance = calculateDistance(latitude, longitude, pointLat, pointLon);
      
      return {
        rank: index + 1,
        point_id: point.point_id,
        location: {
          latitude: pointLat,
          longitude: pointLon
        },
        scene_description: point.scene_description,
        images: point.images,
        distance_meters: Math.round(distance),
        createdAt: point.createdAt,
        updatedAt: point.updatedAt
      };
    });
    
    // 4. 返回结果
    res.json({
      success: true,
      data: {
        query: {
          center: {
            latitude: latitude,
            longitude: longitude
          },
          radius_meters: searchRadius
        },
        total_count: formattedPoints.length,
        points: formattedPoints
      }
    });
    
    console.log(`[Navigation] 查询完成，找到 ${formattedPoints.length} 个采样点`);
    
  } catch (error) {
    console.error('[Navigation] 查询附近采样点时出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * 使用 Haversine 公式计算两点间的近似距离（米）
 * @param {number} lat1 - 点1纬度
 * @param {number} lon1 - 点1经度
 * @param {number} lat2 - 点2纬度
 * @param {number} lon2 - 点2经度
 * @returns {number} - 距离（米）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 地球半径（米）
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

module.exports = router;
