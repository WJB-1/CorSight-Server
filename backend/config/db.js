/**
 * MongoDB 连接模块（唯一）
 *
 * - 连接失败时 throw 而非 process.exit，让调用方决定如何处理
 */

const mongoose = require('mongoose');
const config = require('./envConfig');

async function connectDB() {
  const uri = config.database.MONGODB_URI;

  try {
    await mongoose.connect(uri);
    console.log(`[DB] MongoDB connected: ${uri}`);

    mongoose.connection.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected');
    });
  } catch (error) {
    console.error('[DB] Failed to connect to MongoDB:', error.message);
    throw error; // 交给 server.js 处理，不自行 process.exit
  }
}

async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('[DB] MongoDB connection closed');
  } catch (error) {
    console.error('[DB] Error closing MongoDB connection:', error.message);
  }
}

module.exports = { connectDB, disconnectDB };
