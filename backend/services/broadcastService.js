/**
 * 行前预览播报生成服务（薄封装）
 *
 * 职责：调用 LLM 生成播报，fallback 时用模板。
 * 提示词构建和 fallback 模板在 prompts/broadcastPrompt.js。
 */

const { getDashScopeClient } = require('../lib/llmClient');
const { buildSystemPrompt, buildUserPrompt, generateFallbackBroadcast } = require('../prompts/broadcastPrompt');

/**
 * 生成行前预览播报
 * @param {object} routeData
 * @param {Array} sampleContexts
 * @param {object} [options] — { model }
 * @returns {Promise<string>} 播报文本
 */
async function generateBroadcast(routeData, sampleContexts, options = {}) {
  let client;
  try {
    client = getDashScopeClient();
  } catch (_) {
    return generateFallbackBroadcast(routeData, sampleContexts);
  }

  try {
    const response = await client.chat.completions.create({
      model: options.model || 'qwen-plus',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(routeData, sampleContexts) },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const text = response.choices?.[0]?.message?.content || '';
    return text || generateFallbackBroadcast(routeData, sampleContexts);
  } catch (err) {
    console.error('[Broadcast] LLM error:', err.message);
    return generateFallbackBroadcast(routeData, sampleContexts);
  }
}

module.exports = { generateBroadcast };
