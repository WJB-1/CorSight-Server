/**
 * 数据库连接配置
 * 管理 MongoDB 连接
 */

const mongoose = require('mongoose');

// 从环境变量获取 MongoDB URI，否则使用本地默认
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blind_map';

/**
 * 连接到 MongoDB
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      // Mongoose 6+ 不需要这些选项，但保留以防版本问题
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    
    console.log(`[Database] MongoDB 连接成功: ${conn.connection.host}:${conn.connection.port}`);
    console.log(`[Database] 数据库名称: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error('[Database] MongoDB 连接失败:', error.message);
    process.exit(1);
  }
}

/**
 * 断开数据库连接
 * @returns {Promise<void>}
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('[Database] MongoDB 连接已断开');
  } catch (error) {
    console.error('[Database] 断开连接时出错:', error.message);
  }
}

/**
 * 检查数据库连接状态
 * @returns {number} - 连接状态码 (0=断开, 1=连接中, 2=已连接)
 */
function getConnectionStatus() {
  return mongoose.connection.readyState;
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getConnectionStatus,
  MONGODB_URI
};
