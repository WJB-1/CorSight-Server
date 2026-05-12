const mongoose = require('mongoose');

/**
 * 采样点数据模型
 * 与 Blind_map 项目共享数据库，使用相同的 Schema 结构
 */
const samplingPointSchema = new mongoose.Schema({
  // 采样点唯一标识符
  point_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // 地理坐标（GeoJSON Point 格式）
  // 注意：与 Blind_map 保持一致，使用 'location' 字段名
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },

  // 场景描述
  scene_description: {
    type: String,
    default: ''
  },

  // 8个方位的图片路径
  images: {
    N: { type: String, default: null },
    NE: { type: String, default: null },
    E: { type: String, default: null },
    SE: { type: String, default: null },
    S: { type: String, default: null },
    SW: { type: String, default: null },
    W: { type: String, default: null },
    NW: { type: String, default: null }
  }
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt
  collection: 'sampling_points' // 与 Blind_map 使用相同的集合名
});

// 为 GeoJSON 坐标建立 2dsphere 索引
samplingPointSchema.index({ location: '2dsphere' });

const SamplingPoint = mongoose.model('SamplingPoint', samplingPointSchema);

/**
 * 查询附近的采样点（基于 GeoJSON 2dsphere 索引）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {number} radius - 半径（米）
 * @returns {Promise<Array>} 采样点数组
 */
async function findNearbyPoints(lat, lon, radius = 50) {
  return SamplingPoint.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        $maxDistance: radius
      }
    }
  }).limit(20).lean();
}

/**
 * 保存采样点（upsert）
 * @param {Object} data - 采样点数据
 * @returns {Promise<Object>} 保存后的文档
 */
async function saveSamplingPoint(data) {
  const filter = { point_id: data.point_id };
  const update = {
    $set: {
      location: data.location,
      scene_description: data.scene_description || '',
      images: data.images || {}
    }
  };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  return SamplingPoint.findOneAndUpdate(filter, update, options);
}

/**
 * 将度分秒(DMS)转换为十进制度数
 * @param {string|number} dms - DMS 字符串如 "113°19'31.64\"E" 或十进制数字
 * @returns {number} 十进制度数
 */
function convertDMSToDecimal(dms) {
  if (typeof dms === 'number') return dms;
  if (typeof dms !== 'string') {
    throw new Error(`Unsupported coordinate type: ${typeof dms}`);
  }

  // 已经是十进制数字字符串
  const directNumber = parseFloat(dms);
  if (!isNaN(directNumber) && !/[°'\"NESW]/i.test(dms)) {
    return directNumber;
  }

  // 解析 DMS 格式：113°19'31.64"E
  const match = dms.match(/(\d+)°(\d+)'([\d.]+)"?\s*([NESW])/i);
  if (!match) {
    // 尝试纯数字
    const num = parseFloat(dms);
    if (!isNaN(num)) return num;
    throw new Error(`Cannot parse DMS: ${dms}`);
  }

  const degrees = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const direction = match[4].toUpperCase();

  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }

  return decimal;
}

module.exports = { SamplingPoint, findNearbyPoints, saveSamplingPoint, convertDMSToDecimal };
