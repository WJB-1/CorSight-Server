const mongoose = require('mongoose');
const config = require('./envConfig');

/**
 * 连接 MongoDB 数据库
 * @returns {Promise<void>}
 */
async function connectDB() {
  try {
    const uri = config.database.MONGODB_URI;

    await mongoose.connect(uri, {
      // Mongoose 8.x 不需要显式传递这些选项，使用默认值即可
    });

    console.log('✅ MongoDB connected successfully');

    // 监听连接事件
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

/**
 * 断开 MongoDB 连接
 * @returns {Promise<void>}
 */
async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('📴 MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
}

module.exports = {
  connectDB,
  disconnectDB
};