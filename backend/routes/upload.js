/**
 * 子模块 5.2: Data Receiver
 * 
 * 多媒体接收与解析层
 * 处理前端传来的 8 张环视图片 + 1 个 JSON 描述的复杂混合包
 * 
 * 接口端点：POST /api/upload/sampling_point
 * 请求格式：multipart/form-data
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { saveSamplingPoint, convertDMSToDecimal } = require('../models/SamplingPoint');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../public/images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 从请求体中提取 point_id 和方向
    const pointId = req.body.point_id || 'unknown';
    const fieldName = file.fieldname; // 例如：image_N, image_NE
    const direction = fieldName.replace('image_', ''); // 提取方向：N, NE, E 等
    
    // 重命名格式：[point_id]_[方向].jpg
    const newFilename = `${pointId}_${direction}.jpg`;
    cb(null, newFilename);
  }
});

// 文件过滤 - 只接受图片
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
  }
};

// Multer 配置
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 22 * 1024 * 1024, // 限制单个文件 22MB（基于数据集最大图片 14.2MB 的 150%）
    files: 8 // 最多 8 张图片
  }
});

// 定义允许的图片字段
const uploadFields = [
  { name: 'image_N', maxCount: 1 },
  { name: 'image_NE', maxCount: 1 },
  { name: 'image_E', maxCount: 1 },
  { name: 'image_SE', maxCount: 1 },
  { name: 'image_S', maxCount: 1 },
  { name: 'image_SW', maxCount: 1 },
  { name: 'image_W', maxCount: 1 },
  { name: 'image_NW', maxCount: 1 }
];

/**
 * POST /api/upload/sampling_point
 * 处理上传的采样点数据（图片 + JSON）
 */
router.post('/sampling_point', upload.fields(uploadFields), async (req, res) => {
  try {
    console.log('[Upload] 接收到采样点上传请求');
    
    // 1. 提取表单中的 jsonData 文本字段
    let pointData;
    if (req.body.jsonData) {
      try {
        pointData = JSON.parse(req.body.jsonData);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'JSON 数据解析失败',
          error: parseError.message
        });
      }
    } else {
      // 如果没有 jsonData 字段，尝试从 body 直接获取
      pointData = req.body;
    }
    
    // 验证必需字段
    if (!pointData.point_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必需的 point_id 字段'
      });
    }
    
    if (!pointData.coordinates) {
      return res.status(400).json({
        success: false,
        message: '缺少必需的 coordinates 字段'
      });
    }
    
    // 2. 处理经纬度转换（度分秒 -> 十进制）
    let longitude, latitude;
    try {
      longitude = convertDMSToDecimal(pointData.coordinates.longitude);
      latitude = convertDMSToDecimal(pointData.coordinates.latitude);
    } catch (convertError) {
      return res.status(400).json({
        success: false,
        message: '经纬度格式转换失败',
        error: convertError.message
      });
    }
    
    // 3. 处理上传的图片，构建图片路径映射
    const images = {};
    const imageMappings = {};
    
    if (req.files) {
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      
      directions.forEach(dir => {
        const fieldName = `image_${dir}`;
        if (req.files[fieldName] && req.files[fieldName].length > 0) {
          const file = req.files[fieldName][0];
          const relativePath = `/public/images/${file.filename}`;
          images[dir] = relativePath;
          imageMappings[dir] = {
            originalName: file.originalname,
            savedPath: relativePath,
            size: file.size
          };
        } else {
          // 如果某个方向没有上传图片，检查 JSON 中是否已有路径
          images[dir] = pointData.images && pointData.images[dir] ? pointData.images[dir] : null;
        }
      });
    }
    
    // 4. 构建符合 Schema 的数据对象
    const dbData = {
      point_id: pointData.point_id,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // 注意：GeoJSON 顺序是 [经度, 纬度]
      },
      scene_description: pointData.scene_description || '',
      images: images
    };
    
    // 5. 调用 5.3 模块的写入方法存入数据库
    const savedPoint = await saveSamplingPoint(dbData);
    
    // 6. 返回成功响应
    res.status(201).json({
      success: true,
      message: '采样点上传成功',
      data: {
        point_id: savedPoint.point_id,
        location: savedPoint.location,
        scene_description: savedPoint.scene_description,
        images: savedPoint.images,
        image_mappings: imageMappings,
        createdAt: savedPoint.createdAt,
        updatedAt: savedPoint.updatedAt
      }
    });
    
    console.log(`[Upload] 采样点 ${pointData.point_id} 处理完成`);
    
  } catch (error) {
    console.error('[Upload] 处理上传时出错:', error);
    
    // 清理已上传的文件（如果出错）
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error('[Upload] 清理文件失败:', err.message);
          });
        });
      });
    }
    
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * 错误处理中间件 - 处理 Multer 错误
 */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    // Multer 特定的错误
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过限制（最大 10MB）'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: '文件数量超过限制（最多 8 张）'
      });
    }
    return res.status(400).json({
      success: false,
      message: '文件上传错误',
      error: error.message
    });
  }
  
  // 其他错误
  if (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
  
  next();
});

module.exports = router;
