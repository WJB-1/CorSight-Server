const axios = require('axios');
const config = require('../config/envConfig');

/**
 * CorSight 空间查询服务
 * 通过 HTTP API 从 Blind_map 后端获取采样点数据
 *
 * 架构解耦:
 * - navigation_agent 后端 (3002) -> Blind_map 后端 (3001)
 * - 无需直接连接数据库，通过 REST API 通信
 */

// Blind_map 后端配置
const BLINDMAP_BASE_URL = config.external.BLINDMAP_URL;

/**
 * 从 Blind_map 后端查询附近的采样点
 * 
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {number} radius - 搜索半径（单位：米），默认 50 米
 * @returns {Promise<Array>} 返回附近采样点数组
 */
async function getNearbyPoints(lat, lon, radius = 50) {
  try {
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

    console.log(`[CorSight] 从 Blind_map 查询附近采样点: 中心(${lat}, ${lon}), 半径${radius}m`);

    // 调用 Blind_map 的 API
    const response = await axios.get(`${BLINDMAP_BASE_URL}/api/navigation/nearby`, {
      params: {
        lat: lat,
        lon: lon,
        radius: radius
      },
      timeout: 5000 // 5秒超时
    });

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.message || 'Blind_map 返回错误');
    }

    const points = response.data.data?.points || [];

    console.log(`[CorSight] 从 Blind_map 获取到 ${points.length} 个采样点`);

    // 转换图片路径为完整 URL
    const formattedPoints = points.map(point => {
      return {
        point_id: point.point_id,
        location: point.location,
        scene_description: point.scene_description,
        images: transformImageUrls(point.images, point.point_id),
        distance_meters: point.distance_meters
      };
    });

    return formattedPoints;

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('[CorSight] 无法连接到 Blind_map 后端，请确认端口 3001 已启动');
      throw new Error('Blind_map 后端服务不可用');
    }
    console.error('[CorSight] 查询采样点失败:', error.message);
    throw error;
  }
}

/**
 * 从 Blind_map 后端获取单个采样点详情
 * 
 * @param {string} pointId - 采样点唯一标识
 * @returns {Promise<Object|null>} 采样点详情或 null
 */
async function getPointById(pointId) {
  try {
    // Blind_map 暂时没有单个点查询 API，先通过附近查询模拟
    // 或者可以直接从 nearby 接口获取所有点然后过滤
    console.log(`[CorSight] 获取采样点详情: ${pointId}`);

    // 注意：这里假设 point_id 格式为 P001, P002 等
    // 实际应该调用 Blind_map 的特定 API，但暂时用 nearby 接口 workaround
    // 通过查询一个很大的范围来获取所有点，然后过滤

    // 临时方案：返回一个简化结构，实际使用时应扩展 Blind_map API
    return {
      point_id: pointId,
      location: null, // 需要通过其他方式获取
      scene_description: '',
      images: {},
      distance_meters: 0
    };

  } catch (error) {
    console.error('[CorSight] 获取采样点详情失败:', error.message);
    throw error;
  }
}

/**
 * 转换图片路径为完整 URL
 * 将数据库中存储的相对路径转换为 Blind_map 后端可访问的完整 URL
 * 
 * @param {Object} images - 图片路径对象
 * @param {string} pointId - 采样点ID
 * @returns {Object} - 转换后的图片URL对象
 */
function transformImageUrls(images, pointId) {
  if (!images) return {};

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const result = {};

  directions.forEach(dir => {
    if (images[dir]) {
      // 如果已经是完整 URL，直接使用
      if (images[dir].startsWith('http')) {
        result[dir] = images[dir];
      } else {
        // 将相对路径转换为完整 URL
        // 例如: "images/P001_N.jpg" -> "http://localhost:3001/images/P001_N.jpg"
        const filename = images[dir].includes('/')
          ? images[dir].split('/').pop()
          : `${pointId}_${dir}.jpg`;
        result[dir] = `${BLINDMAP_BASE_URL}/images/${filename}`;
      }
    }
  });

  return result;
}

/**
 * 创建新的采样点（转发到 Blind_map）
 * 
 * @param {Object} pointData - 采样点数据
 * @returns {Promise<Object>} 创建的采样点
 */
async function createPoint(pointData) {
  // 如果需要创建采样点，应该调用 Blind_map 的 POST /api/upload/sampling_point
  // 这里暂时返回错误，建议直接操作 Blind_map 后端
  throw new Error('创建采样点请直接调用 Blind_map 后端 API');
}

module.exports = {
  getNearbyPoints,
  getPointById,
  createPoint
};
