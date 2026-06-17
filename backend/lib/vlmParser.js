/**
 * VLM 响应解析 + 图片编码工具（纯函数）
 *
 * 从 vlmService 中提取，供 single/batch 两条路径共用。
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析 VLM 返回的 JSON 文本
 * 支持：直接 JSON、代码块包裹、裸花括号
 *
 * @param {string} text
 * @returns {object|null} 解析后的对象，解析失败返回 { _parseFailed: true, _rawText: text.slice(0,500) }
 */
function parseVlmResponse(text) {
  if (!text || typeof text !== 'string') return null;

  try { return JSON.parse(text); } catch (_) {}

  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1].trim()); } catch (_) {}
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }

  return { _parseFailed: true, _rawText: text.slice(0, 500) };
}

/**
 * 读取本地图片转 base64 data URL
 * @param {string} imagePath - 相对路径如 /images/P_xxx_N.jpg
 * @returns {string} data:image/jpeg;base64,...
 */
function imageToBase64Url(imagePath) {
  const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
  const fullPath = path.join(__dirname, '..', 'public', cleanPath);
  if (!fs.existsSync(fullPath)) throw new Error(`Image not found: ${fullPath}`);

  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * ReadableStream → string
 */
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
  }
  return chunks.join('');
}

module.exports = { parseVlmResponse, imageToBase64Url, streamToString };
