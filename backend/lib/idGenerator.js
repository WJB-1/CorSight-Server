/**
 * ID 生成器
 * - session_id 格式：S_{timestamp}_{6位hex}
 * - point_id 格式：P_{timestamp}_{6位hex}（通常由客户端生成，后端备用）
 */

const crypto = require('crypto');

function generateSessionId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString('hex');
  return `S_${ts}_${rand}`;
}

function generatePointId() {
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString('hex');
  return `P_${ts}_${rand}`;
}

module.exports = { generateSessionId, generatePointId };
