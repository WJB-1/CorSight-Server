/**
 * VLM（视觉语言模型）服务
 *
 * 接入阿里云百炼 API，使用 qwen-vl-plus 模型进行街景图片分析。
 * 支持单张实时调用和批量推理两种模式。
 *
 * API 兼容 OpenAI 格式：https://dashscope.aliyuncs.com/compatible-mode/v1
 * 模型：qwen-vl-plus（千问 VL Plus，多模态）
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config/envConfig');

const API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = 'qwen-vl-plus';

/**
 * 获取 OpenAI 客户端（阿里云百炼兼容接口）
 */
function getClient() {
  const apiKey = config.llm.BAILIAN_API_KEY;
  if (!apiKey) {
    throw new Error('BAILIAN_API_KEY not configured');
  }
  return new OpenAI({ apiKey, baseURL: API_BASE });
}

/**
 * 读取本地图片并转为 base64 data URL
 * @param {string} imagePath - 相对路径如 /images/P_xxx_0_123.jpg
 * @returns {string} data:image/jpeg;base64,...
 */
function imageToBase64Url(imagePath) {
  // 处理路径：去掉前导 / ，拼接 public 目录
  const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
  const fullPath = path.join(__dirname, '..', 'public', cleanPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Image file not found: ${fullPath}`);
  }

  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * 解析 VLM 返回的 JSON 文本
 * 处理可能的 markdown 代码块包裹
 */
function parseVlmResponse(text) {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch (_) {}

  // 尝试提取代码块内的 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) {}
  }

  // 尝试提取花括号包裹的 JSON
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (_) {}
  }

  return null;
}

/**
 * 分析单张图片（实时调用）
 *
 * @param {string} imagePath - 图片相对路径（如 /images/P_xxx_0_123.jpg）
 * @param {string} prompt - 提示词
 * @param {object} [options]
 * @returns {Promise<{osm_tags: object, description: string, confidence: number}>}
 */
async function analyzeImage(imagePath, prompt, options = {}) {
  const client = getClient();

  const imageUrl = imageToBase64Url(imagePath);

  const response = await client.chat.completions.create({
    model: options.model || MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    temperature: options.temperature || 0.1,
    max_tokens: options.maxTokens || 1500,
  });

  const text = response.choices?.[0]?.message?.content || '';
  const parsed = parseVlmResponse(text);

  if (parsed) {
    return {
      osm_tags: parsed.osm_tags || {},
      description: parsed.description || '',
      confidence: parsed.confidence || 0,
    };
  }

  // 解析失败，返回原始文本作为 description
  return {
    osm_tags: {},
    description: text.slice(0, 500),
    confidence: 0,
    _parseFailed: true,
  };
}

/**
 * 批量分析图片
 *
 * 当前实现：逐张串行调用（开发阶段，避免并发限流）
 * 后续优化：切换到阿里云百炼 Batch API（JSONL 批量提交，成本减半）
 *
 * @param {Array<{custom_id: string, imagePath: string, prompt: string}>} tasks
 * @returns {Promise<Array<{custom_id: string, osm_tags: object, description: string, confidence: number}>>}
 */
async function analyzeBatch(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const client = getClient();
  const results = [];

  console.log(`[VLM] Batch analyze: ${tasks.length} images (serial mode)`);
  const t0 = Date.now();

  for (const task of tasks) {
    try {
      const imageUrl = imageToBase64Url(task.imagePath);

      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: task.prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      });

      const text = response.choices?.[0]?.message?.content || '';
      const parsed = parseVlmResponse(text);

      results.push({
        custom_id: task.custom_id,
        osm_tags: parsed?.osm_tags || {},
        description: parsed?.description || text.slice(0, 500),
        confidence: parsed?.confidence || 0,
      });

      // 简单限流：每次请求间隔 200ms
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.warn(`[VLM] Failed for ${task.custom_id}:`, err.message);
      results.push({
        custom_id: task.custom_id,
        osm_tags: {},
        description: '',
        confidence: 0,
        _error: err.message,
      });
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[VLM] Batch done: ${results.length} images in ${elapsed}s`);

  return results;
}

module.exports = {
  analyzeImage,
  analyzeBatch,
  // 暴露内部方法供测试
  imageToBase64Url,
  parseVlmResponse,
};
