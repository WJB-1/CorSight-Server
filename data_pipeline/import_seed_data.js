/**
 * 街景数据导入脚本
 * 
 * 功能：将本地结构化好的街景数据集读取、转换并批量导入到 MongoDB 中
 * 目标集合：sampling_points
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ============================================
// 配置区域
// ============================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';
const DATA_FILE_PATH = path.join(__dirname, 'map_data.json');

// ============================================
// 定义 Schema 和 Model
// ============================================

const samplingPointSchema = new mongoose.Schema({
  point_id: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  location: {
    type: { 
      type: String, 
      enum: ['Point'], 
      default: 'Point',
      required: true
    },
    coordinates: { 
      type: [Number], 
      required: true 
    }
  },
  scene_description: { 
    type: String, 
    default: "" 
  },
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
  timestamps: true,
  collection: 'sampling_points'
});

// 创建 2dsphere 索引
samplingPointSchema.index({ location: '2dsphere' });

const SamplingPoint = mongoose.model('SamplingPoint', samplingPointSchema);

// ============================================
// 核心功能函数
// ============================================

/**
 * 转换图片路径
 * 将相对路径转换为后端可访问的路径
 * @param {Object} images - 原始图片路径对象
 * @param {string} pointId - 采样点ID
 * @returns {Object} - 转换后的图片路径对象
 */
function transformImagePaths(images, pointId) {
  const transformed = {};
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  
  directions.forEach(dir => {
    if (images[dir]) {
      // 将 "images/P001_N.jpg" 转换为 "/images/P001_N.jpg"
      // 这样前端可以通过后端静态文件服务访问
      transformed[dir] = images[dir].startsWith('/') ? images[dir] : `/${images[dir]}`;
    } else {
      transformed[dir] = null;
    }
  });
  
  return transformed;
}

/**
 * 转换单条数据记录
 * @param {Object} rawData - 原始数据对象
 * @returns {Object} - 符合 Schema 的数据对象
 */
function transformRecord(rawData) {
  return {
    point_id: rawData.point_id,
    location: {
      type: 'Point',
      coordinates: [
        rawData.coordinates.longitude,  // 经度在前
        rawData.coordinates.latitude    // 纬度在后
      ]
    },
    scene_description: rawData.scene_description || "",
    images: transformImagePaths(rawData.images, rawData.point_id)
  };
}

/**
 * 读取并解析原始数据文件
 * @returns {Array} - 原始数据数组
 */
function readRawData() {
  try {
    const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
    const data = JSON.parse(fileContent);
    
    if (!Array.isArray(data)) {
      throw new Error('数据文件格式错误：期望是一个数组');
    }
    
    console.log(`[INFO] 成功读取数据文件，共 ${data.length} 条记录`);
    return data;
  } catch (error) {
    console.error('[ERROR] 读取数据文件失败:', error.message);
    throw error;
  }
}

/**
 * 连接 MongoDB 数据库
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[INFO] MongoDB 连接成功');
    console.log(`[INFO] 数据库 URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  } catch (error) {
    console.error('[ERROR] MongoDB 连接失败:', error.message);
    throw error;
  }
}

/**
 * 断开数据库连接
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('[INFO] MongoDB 连接已断开');
  } catch (error) {
    console.error('[ERROR] 断开数据库连接时出错:', error.message);
  }
}

/**
 * 批量导入数据
 * @param {Array} records - 转换后的数据记录数组
 */
async function importData(records) {
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  
  console.log(`[INFO] 开始导入数据，共 ${records.length} 条记录...`);
  console.log('-------------------------------------------');
  
  // 使用 insertMany 批量插入
  try {
    const result = await SamplingPoint.insertMany(records, {
      ordered: false,  // 遇到错误继续插入其他记录
      rawResult: true
    });
    
    successCount = result.insertedCount || records.length;
    console.log(`[SUCCESS] 批量插入成功: ${successCount} 条记录`);
    
  } catch (error) {
    // 处理批量插入中的部分错误
    if (error.writeErrors && error.writeErrors.length > 0) {
      failCount = error.writeErrors.length;
      successCount = records.length - failCount;
      
      error.writeErrors.forEach((writeError, index) => {
        const errMsg = `[FAIL-${index + 1}] 记录 #${writeError.index} (point_id: ${records[writeError.index]?.point_id || 'unknown'}): ${writeError.errmsg}`;
        errors.push(errMsg);
        console.error(errMsg);
      });
    } else {
      // 其他类型的错误
      failCount = records.length;
      const errMsg = `[ERROR] 批量插入失败: ${error.message}`;
      errors.push(errMsg);
      console.error(errMsg);
    }
  }
  
  console.log('-------------------------------------------');
  console.log(`[SUMMARY] 导入完成:`);
  console.log(`  - 成功: ${successCount} 条`);
  console.log(`  - 失败: ${failCount} 条`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log(`\n[DETAILS] 错误详情:`);
    errors.forEach(err => console.log(`  ${err}`));
  } else if (errors.length > 10) {
    console.log(`\n[DETAILS] 错误详情 (显示前10条):`);
    errors.slice(0, 10).forEach(err => console.log(`  ${err}`));
    console.log(`  ... 还有 ${errors.length - 10} 条错误未显示`);
  }
  
  return { successCount, failCount, errors };
}

/**
 * 清空集合（可选）
 */
async function clearCollection() {
  try {
    await SamplingPoint.deleteMany({});
    console.log('[INFO] 已清空 sampling_points 集合');
  } catch (error) {
    console.error('[ERROR] 清空集合失败:', error.message);
    throw error;
  }
}

// ============================================
// 主程序
// ============================================

async function main() {
  const startTime = Date.now();
  
  console.log('===========================================');
  console.log('    街景数据导入脚本 - Street View Data Import');
  console.log('===========================================\n');
  
  try {
    // 步骤 1: 读取原始数据
    const rawData = readRawData();
    
    // 步骤 2: 转换数据格式
    console.log('[INFO] 正在转换数据格式...');
    const transformedRecords = rawData.map(transformRecord);
    console.log(`[INFO] 数据格式转换完成\n`);
    
    // 步骤 3: 连接数据库
    await connectDatabase();
    
    // 可选：清空集合（如果需要重新导入）
    // await clearCollection();
    
    // 步骤 4: 批量导入数据
    const result = await importData(transformedRecords);
    
    // 步骤 5: 统计信息
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[INFO] 总耗时: ${duration} 秒`);
    
    // 根据导入结果设置退出码
    if (result.failCount === 0) {
      console.log('\n[SUCCESS] 所有数据导入成功！');
      process.exitCode = 0;
    } else {
      console.log('\n[WARNING] 部分数据导入失败');
      process.exitCode = 1;
    }
    
  } catch (error) {
    console.error('\n[ERROR] 脚本执行失败:', error.message);
    process.exitCode = 1;
  } finally {
    // 强制要求：断开数据库连接并优雅退出
    await disconnectDatabase();
    console.log('\n[INFO] 脚本执行完毕');
    process.exit(process.exitCode || 0);
  }
}

// 运行主程序
main();

/**
 * ============================================
 * 使用说明
 * ============================================
 * 
 * 1. 确保 MongoDB 服务已启动
 * 
 * 2. 确保已安装 mongoose 依赖：
 *    cd data_pipeline && npm install mongoose
 *    或在 backend 目录下运行（已安装 mongoose）
 * 
 * 3. 运行脚本：
 *    node data_pipeline/import_seed_data.js
 * 
 * 4. 使用自定义数据库 URI：
 *    MONGODB_URI=mongodb://user:pass@localhost:27017/dbname node data_pipeline/import_seed_data.js
 * 
 * 5. 数据文件位置：
 *    - 默认读取与脚本同目录下的 map_data.json
 *    - 图片路径会转换为以 /images/ 开头的绝对路径
 *    - 实际图片应存放在 backend/public/images/ 目录下
 * 
 * ============================================
 */