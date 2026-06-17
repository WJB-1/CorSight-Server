/**
 * 统一 LLM 客户端工厂
 *
 * 消除 vlmService 和 broadcastService 各自实例化 OpenAI 客户端的重复。
 */

const OpenAI = require('openai');
const config = require('../config/envConfig');

const DASHSCOPE_API = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

/**
 * 获取阿里云百炼 OpenAI 兼容客户端
 * @returns {OpenAI}
 * @throws {Error} API key 未配置时抛出
 */
function getDashScopeClient() {
  const apiKey = config.llm.BAILIAN_API_KEY;
  if (!apiKey) throw new Error('BAILIAN_API_KEY not configured');
  return new OpenAI({ apiKey, baseURL: DASHSCOPE_API });
}

module.exports = { getDashScopeClient, DASHSCOPE_API };
