const axios = require('axios');
const config = require('../config/envConfig');
const { findNearbyPoints } = require('../models/SamplingPoint');

/**
 * CorSight 空间查询服务
 *
 * 已合并为统一服务，优先直接查询本地数据库。
 * 保留 HTTP 回退以兼容外部 Blind_map 实例。
 */

const BLINDMAP_BASE_URL = config.external.BLINDMAP_URL;

/**
 * 查询附近的采样点
 *
 * 策略：优先直接查询本地数据库，失败时回退到 HTTP 调用
 *
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {number} radius - 搜索半径（单位：米），默认 50 米
 * @returns {Promise<Array>} 返回附近采样点数组
 */
async function getNearbyPoints(lat, lon, radius = 50) {
  // 验证输入参数
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('Latitude and longitude must be numbers');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }
  if (lon < -180 || lon > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }
  if (radius <= 0 || radius > 10000) {
    throw new Error('Radius must be between 1 and 10000 meters');
  }

  console.log(`[CorSight] Querying nearby sampling points: center(${lat}, ${lon}), radius ${radius}m`);

  // 查询本地数据库
  try {
    const nearbyPoints = await findNearbyPoints(lat, lon, radius);

    console.log(`[CorSight] Found ${nearbyPoints.length} points from local database`);

    const formattedPoints = nearbyPoints.map((point, index) => {
      const pointLat = point.location.coordinates[1];
      const pointLon = point.location.coordinates[0];
      const distance = calculateDistance(lat, lon, pointLat, pointLon);

      return {
        rank: index + 1,
        point_id: point.point_id,
        location: { latitude: pointLat, longitude: pointLon },
        scene_description: point.scene_description,
        images: transformImageUrls(point.images, point.point_id),
        distance_meters: Math.round(distance)
      };
    });

    return formattedPoints;
  } catch (dbError) {
    console.error(`[CorSight] Local database query failed: ${dbError.message}`);
    throw dbError;
  }
}

/**
 * 获取单个采样点详情
 */
async function getPointById(pointId) {
  console.log(`[CorSight] Getting sampling point details: ${pointId}`);

  return {
    point_id: pointId,
    location: null,
    scene_description: '',
    images: {},
    distance_meters: 0
  };
}

/**
 * 转换图片路径为完整 URL
 */
function transformImageUrls(images, pointId) {
  if (!images) return {};

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const result = {};
  const selfBaseUrl = `http://localhost:${process.env.PORT || 3002}`;

  directions.forEach(dir => {
    if (images[dir]) {
      if (images[dir].startsWith('http')) {
        result[dir] = images[dir];
      } else {
        const filename = images[dir].includes('/')
          ? images[dir].split('/').pop()
          : `${pointId}_${dir}.jpg`;
        // 优先使用本机地址（已合并服务）
        result[dir] = `${selfBaseUrl}/images/${filename}`;
      }
    }
  });

  return result;
}

/**
 * 使用 Haversine 公式计算两点间距离（米）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
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

module.exports = {
  getNearbyPoints,
  getPointById
};
