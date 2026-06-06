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

// 阶段1：用临时文件名保存（避免 multer 阶段 req.body 未解析的问题）
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 临时文件名：timestamp_random.ext
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e9);
    cb(null, `tmp_${uniqueSuffix}${path.extname(file.originalname)}`);
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
  storage: tempStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 22 * 1024 * 1024, // 限制单个文件 22MB
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
 * 规范化 point_id
 * 支持格式：P001, P_1234567890_12345 等
 * 返回安全的文件名前缀
 */
function normalizePointId(pointId) {
  if (!pointId || typeof pointId !== 'string') {
    return null;
  }
  // 只允许字母、数字、下划线、连字符
  return pointId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * POST /api/upload/sampling_point
 * 处理上传的采样点数据（图片 + JSON）
 */
router.post('/sampling_point', upload.fields(uploadFields), async (req, res) => {
  // 阶段2：body 已解析，执行重命名和数据库写入
  try {
    console.log('[Upload] 接收到采样点上传请求');

    // 1. 提取表单中的 jsonData 文本字段
    let pointData;
    if (req.body.jsonData) {
      try {
        pointData = JSON.parse(req.body.jsonData);
      } catch (parseError) {
        // 解析失败，清理临时文件
        cleanupFiles(req.files);
        return res.status(400).json({
          success: false,
          message: 'JSON 数据解析失败',
          error: parseError.message
        });
      }
    } else {
      pointData = req.body;
    }

    // 验证必需字段
    if (!pointData.point_id) {
      cleanupFiles(req.files);
      return res.status(400).json({
        success: false,
        message: '缺少必需的 point_id 字段'
      });
    }

    if (!pointData.coordinates) {
      cleanupFiles(req.files);
      return res.status(400).json({
        success: false,
        message: '缺少必需的 coordinates 字段'
      });
    }

    // 2. 处理经纬度转换
    let longitude, latitude;
    const rawLon = pointData.coordinates?.longitude;
    const rawLat = pointData.coordinates?.latitude;
    console.log(`[Upload] Raw coordinates: lon=${JSON.stringify(rawLon)} (type: ${typeof rawLon}), lat=${JSON.stringify(rawLat)} (type: ${typeof rawLat})`);

    try {
      longitude = convertDMSToDecimal(rawLon);
      latitude = convertDMSToDecimal(rawLat);
    } catch (convertError) {
      cleanupFiles(req.files);
      console.error('[Upload] Coordinate conversion failed:', convertError.message, 'rawLon:', rawLon, 'rawLat:', rawLat);
      return res.status(400).json({
        success: false,
        message: `经纬度格式转换失败: ${convertError.message}`,
        error: convertError.message
      });
    }

    // 3. 重命名文件并构建图片路径映射
    const safePointId = normalizePointId(pointData.point_id);
    const images = {};
    const imageMappings = {};

    if (req.files) {
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

      directions.forEach(dir => {
        const fieldName = `image_${dir}`;
        if (req.files[fieldName] && req.files[fieldName].length > 0) {
          const file = req.files[fieldName][0];

          // 构建新文件名：[point_id]_[方向].jpg
          const newFilename = `${safePointId}_${dir}.jpg`;
          const newPath = path.join(uploadDir, newFilename);

          // 如果目标文件已存在，先删除（覆盖旧数据）
          if (fs.existsSync(newPath) && newPath !== file.path) {
            try {
              fs.unlinkSync(newPath);
              console.log(`[Upload] 覆盖旧文件: ${newFilename}`);
            } catch (err) {
              console.warn(`[Upload] 删除旧文件失败: ${err.message}`);
            }
          }

          // 重命名临时文件
          try {
            fs.renameSync(file.path, newPath);
          } catch (renameErr) {
            console.error(`[Upload] 重命名失败: ${renameErr.message}`);
            // 回退：保留临时文件名
            images[dir] = `/public/images/${path.basename(file.path)}`;
            imageMappings[dir] = {
              originalName: file.originalname,
              savedPath: `/public/images/${path.basename(file.path)}`,
              size: file.size,
              renamed: false
            };
            return;
          }

          const relativePath = `/public/images/${newFilename}`;
          images[dir] = relativePath;
          imageMappings[dir] = {
            originalName: file.originalname,
            savedPath: relativePath,
            size: file.size,
            renamed: true
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
        coordinates: [longitude, latitude] // GeoJSON 顺序是 [经度, 纬度]
      },
      scene_description: pointData.scene_description || '',
      images: images
    };

    // 5. 存入数据库
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

    // 清理所有上传的文件
    cleanupFiles(req.files);

    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * 清理上传的文件（用于错误处理）
 */
function cleanupFiles(files) {
  if (!files) return;
  Object.values(files).forEach(fileArray => {
    fileArray.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlink(file.path, (err) => {
          if (err) console.error('[Upload] 清理文件失败:', err.message);
        });
      }
    });
  });
}

/**
 * 错误处理中间件 - 处理 Multer 错误
 */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过限制（最大 22MB）'
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

  if (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }

  next();
});

/**
 * POST /api/upload/image
 * 分批上传单张图片（补充到已有采样点）
 */
// 单文件上传的 multer 配置（接受任意字段名）
const singleUpload = multer({
  storage: tempStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 22 * 1024 * 1024 }
}).any();

/**
 * POST /api/upload/image
 * 分批上传单张图片（补充到已有采样点）
 */
router.post('/image', (req, res) => {
  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      const pointId = req.body.point_id;
      if (!pointId) {
        cleanupFiles(req.files);
        return res.status(400).json({ success: false, message: '缺少 point_id' });
      }

      // 从上传的文件中解析方向
      const file = req.files?.[0];
      if (!file) {
        return res.status(400).json({ success: false, message: '没有上传文件' });
      }

      const fieldName = file.fieldname;
      const direction = fieldName.startsWith('image_') ? fieldName.replace('image_', '') : null;
      if (!direction || !['N','NE','E','SE','S','SW','W','NW'].includes(direction)) {
        cleanupFiles(req.files);
        return res.status(400).json({ success: false, message: '无效的图片方向: ' + fieldName });
      }

      const safePointId = normalizePointId(pointId);
      const newFilename = `${safePointId}_${direction}.jpg`;
      const newPath = path.join(uploadDir, newFilename);

      // 覆盖旧文件
      if (fs.existsSync(newPath) && newPath !== file.path) {
        try { fs.unlinkSync(newPath); } catch (e) { /* ignore */ }
      }

      fs.renameSync(file.path, newPath);

      // 更新数据库中的图片路径
      const { SamplingPoint } = require('../models/SamplingPoint');
      const updatePath = `/public/images/${newFilename}`;
      await SamplingPoint.updateOne(
        { point_id: pointId },
        { $set: { [`images.${direction}`]: updatePath } }
      );

      res.json({
        success: true,
        message: `图片 ${direction} 上传成功`,
        data: { point_id: pointId, direction, path: updatePath }
      });
    } catch (error) {
      cleanupFiles(req.files);
      console.error('[Upload] 单张图片上传失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
});

/**
 * 清理单个文件
 */
function cleanupFile(file) {
  if (file && fs.existsSync(file.path)) {
    fs.unlink(file.path, (err) => {
      if (err) console.error('[Upload] 清理文件失败:', err.message);
    });
  }
}

module.exports = router;
