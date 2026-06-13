/**
 * VLM（视觉语言模型）服务
 *
 * 封装 VLM API 调用，支持单张和批量模式。
 *
 * 当前状态：占位实现（返回空标签），后续接入真实 API：
 * - 阿里云百炼 Batch API（JSONL 批量推理）
 * - Google Gemini（多模态）
 * - DeepSeek（文本）
 */

/**
 * 分析单张图片
 *
 * @param {string} imagePath - 图片路径（相对 URL）
 * @param {string} prompt - 提示词
 * @param {object} [options] - { model, temperature, ... }
 * @returns {Promise<{osm_tags: object, description: string, confidence: number}>}
 */
async function analyzeImage(imagePath, prompt, options = {}) {
  // TODO: 接入真实 VLM API
  // 当前占位返回
  console.log(`[VLM] Placeholder analyze: ${imagePath} (${prompt.slice(0, 50)}...)`);
  return {
    osm_tags: {},
    description: '',
    confidence: 0,
    _placeholder: true,
  };
}

/**
 * 批量分析图片（JSONL 格式提交）
 *
 * @param {Array<{custom_id: string, imagePath: string, prompt: string}>} tasks
 * @returns {Promise<Array<{custom_id: string, osm_tags: object, description: string}>>}
 */
async function analyzeBatch(tasks) {
  // TODO: 接入阿里云百炼 Batch API
  // 当前占位：逐张返回空结果
  console.log(`[VLM] Placeholder batch analyze: ${tasks.length} images`);

  return tasks.map((task) => ({
    custom_id: task.custom_id,
    osm_tags: {},
    description: '',
    confidence: 0,
    _placeholder: true,
  }));
}

module.exports = {
  analyzeImage,
  analyzeBatch,
};
