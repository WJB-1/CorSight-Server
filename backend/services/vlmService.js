/**
 * VLM（视觉语言模型）服务
 *
 * 接入阿里云百炼 API，使用 qwen-vl-plus 模型进行街景图片分析。
 *
 * 两种模式：
 * 1. 单张实时调用（analyzeImage）—— 用于开发调试
 * 2. 阿里云 Batch API 批量推理（analyzeBatch）—— 生产模式，成本 50%
 *
 * Batch API 流程（参考 batch_infer.md）：
 *   生成 JSONL → 上传文件(POST /v1/files) → 创建 batch(POST /v1/batches)
 *   → 轮询状态(GET /v1/batches/{id}) → 下载结果(GET /v1/files/{id}/content)
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config/envConfig');

const API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = 'qwen-vl-plus';
const BATCH_POLL_INTERVAL_MS = 10000; // 10 秒
const BATCH_MAX_WAIT_MS = 3600000;    // 1 小时

/**
 * 获取 OpenAI 客户端
 */
function getClient() {
  const apiKey = config.llm.BAILIAN_API_KEY;
  if (!apiKey) throw new Error('BAILIAN_API_KEY not configured');
  return new OpenAI({ apiKey, baseURL: API_BASE });
}

/**
 * 读取本地图片并转为 base64 data URL
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
 * 解析 VLM 返回的 JSON（支持代码块、裸花括号）
 */
function parseVlmResponse(text) {
  try { return JSON.parse(text); } catch (_) {}

  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1].trim()); } catch (_) {}
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }

  return null;
}

// ── 单张实时调用 ─────────────────────────────────

/**
 * 分析单张图片（实时 API 调用，用于调试）
 */
async function analyzeImage(imagePath, prompt, options = {}) {
  const client = getClient();
  const imageUrl = imageToBase64Url(imagePath);

  const response = await client.chat.completions.create({
    model: options.model || MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    }],
    temperature: options.temperature || 0.1,
    max_tokens: options.maxTokens || 1500,
  });

  const text = response.choices?.[0]?.message?.content || '';
  const parsed = parseVlmResponse(text);

  if (parsed) {
    return { osm_tags: parsed.osm_tags || {}, description: parsed.description || '', confidence: parsed.confidence || 0 };
  }
  return { osm_tags: {}, description: text.slice(0, 500), confidence: 0, _parseFailed: true };
}

// ── 阿里云 Batch API 批量推理 ────────────────────

/**
 * 生成 JSONL 文件内容
 *
 * 每行格式（OpenAI 兼容）：
 * {"custom_id":"P_xxx_0","method":"POST","url":"/v1/chat/completions","body":{...}}
 */
function buildJsonl(tasks) {
  const lines = [];
  for (const task of tasks) {
    const imageUrl = imageToBase64Url(task.imagePath);
    const line = {
      custom_id: task.custom_id,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: task.prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 1500,
      },
    };
    lines.push(JSON.stringify(line));
  }
  return lines.join('\n') + '\n';
}

/**
 * 上传 JSONL 文件到阿里云百炼
 * @returns {string} file_id
 */
async function uploadJsonlFile(client, jsonlContent, filename) {
  // 写临时文件
  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, filename);
  fs.writeFileSync(tmpPath, jsonlContent, 'utf-8');

  console.log(`[VLM-Batch] Uploading JSONL: ${filename} (${(jsonlContent.length / 1024).toFixed(1)}KB)`);

  const file = await client.files.create({
    file: fs.createReadStream(tmpPath),
    purpose: 'batch',
  });

  // 清理临时文件
  try { fs.unlinkSync(tmpPath); } catch (_) {}

  console.log(`[VLM-Batch] File uploaded: ${file.id}`);
  return file.id;
}

/**
 * 创建批量推理任务
 * @returns {{ batch_id: string, status: string }}
 */
async function createBatch(client, fileId) {
  console.log(`[VLM-Batch] Creating batch with file: ${fileId}`);

  const batch = await client.batches.create({
    input_file_id: fileId,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      ds_name: 'corsight_vlm_batch',
      ds_description: 'CorSight street-view VLM analysis batch',
    },
  });

  console.log(`[VLM-Batch] Batch created: ${batch.id} (status: ${batch.status})`);
  return { batch_id: batch.id, status: batch.status };
}

/**
 * 轮询 batch 状态直到完成或失败
 * @returns {object} 最终的 batch 状态对象
 */
async function pollBatchStatus(client, batchId) {
  const start = Date.now();

  while (Date.now() - start < BATCH_MAX_WAIT_MS) {
    const batch = await client.batches.retrieve(batchId);

    const progress = batch.request_counts
      ? `${batch.request_counts.completed || 0}/${batch.request_counts.total || '?'}`
      : '?';

    console.log(`[VLM-Batch] Status: ${batch.status} (${progress})`);

    if (['completed', 'failed', 'expired', 'cancelled'].includes(batch.status)) {
      return batch;
    }

    await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS));
  }

  throw new Error(`Batch ${batchId} timed out after ${BATCH_MAX_WAIT_MS / 1000}s`);
}

/**
 * 下载并解析 batch 结果文件
 * @returns {Array<{custom_id: string, result: object}>}
 */
async function downloadBatchResults(client, batch) {
  if (batch.status !== 'completed') {
    throw new Error(`Batch not completed: ${batch.status}`);
  }

  const outputFileId = batch.output_file_id;
  if (!outputFileId) throw new Error('No output_file_id in batch response');

  console.log(`[VLM-Batch] Downloading results: ${outputFileId}`);

  const content = await client.files.content(outputFileId);
  const text = await streamToString(content);

  // 逐行解析 JSONL
  const results = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const customId = entry.custom_id;
      const responseText = entry.response?.body?.choices?.[0]?.message?.content || '';
      const parsed = parseVlmResponse(responseText);

      results.push({
        custom_id: customId,
        osm_tags: parsed?.osm_tags || {},
        description: parsed?.description || responseText.slice(0, 500),
        confidence: parsed?.confidence || 0,
      });
    } catch (err) {
      console.warn(`[VLM-Batch] Failed to parse result line:`, err.message);
    }
  }

  console.log(`[VLM-Batch] Downloaded ${results.length} results`);
  return results;
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

/**
 * 批量分析图片（阿里云 Batch API 主入口）
 *
 * @param {Array<{custom_id: string, imagePath: string, prompt: string}>} tasks
 * @returns {Promise<Array<{custom_id: string, osm_tags: object, description: string, confidence: number}>>}
 */
async function analyzeBatch(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const client = getClient();
  const t0 = Date.now();

  console.log(`[VLM-Batch] Starting batch: ${tasks.length} images`);

  // 1. 生成 JSONL
  const jsonl = buildJsonl(tasks);
  const filename = `batch_${Date.now()}.jsonl`;

  // 2. 上传文件
  const fileId = await uploadJsonlFile(client, jsonl, filename);

  // 3. 创建 batch
  const { batch_id } = await createBatch(client, fileId);

  // 4. 轮询状态
  const batch = await pollBatchStatus(client, batch_id);

  // 5. 下载结果
  const results = await downloadBatchResults(client, batch);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[VLM-Batch] Completed: ${results.length} results in ${elapsed}s`);

  return results;
}

// ── 实时导航指引分析 ───────────────────────────────

/**
 * 分析导航指引帧 — 带滚动上下文的单帧实时分析
 *
 * 与 analyzeImage 的区别：
 *   1. 输入帧是摄像头 base64 而非本地文件路径
 *   2. 预置系统提示词负责"指引者"角色
 *   3. 返回结构化指引结果（on_track/guidance/summary）
 *   4. 输出的 summary 字段会被下一帧作为上下文使用
 *
 * @param {string} frameBase64 - 摄像头帧的 data URL (data:image/jpeg;base64,...)
 * @param {string} systemPrompt - 系统提示词（指引者角色模板）
 * @param {string} userPrompt - 用户提示词（含宏观指令+标签+历史摘要）
 * @param {object} [options] - 可选参数 { temperature, maxTokens }
 * @returns {Promise<{ on_track: boolean, guidance: string, correction: string|null, summary: string }>}
 */
async function analyzeGuidanceFrame(frameBase64, systemPrompt, userPrompt, options = {}) {
  // 校验输入
  if (!frameBase64 || !frameBase64.startsWith('data:')) {
    throw new Error('analyzeGuidanceFrame: frameBase64 必须是 data URL 格式');
  }

  const client = getClient();

  try {
    const response = await client.chat.completions.create({
      model: options.model || MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: frameBase64 } },
          ],
        },
      ],
      temperature: options.temperature || 0.1,
      max_tokens: options.maxTokens || 1500,
      response_format: { type: 'json_object' },  // 强制 JSON 输出
    });

    const text = response.choices?.[0]?.message?.content || '';
    const parsed = parseVlmResponse(text);

    if (parsed) {
      return {
        on_track: parsed.on_track !== false,
        guidance: parsed.guidance || '请继续沿当前路线前进',
        correction: parsed.correction || null,
        summary: parsed.summary || `告知用户：${(parsed.guidance || '').slice(0, 80)}`,
        osm_tags: parsed.osm_tags || {},
      };
    }

    // 解析失败时的 fallback
    console.warn('[VLM-Guidance] Failed to parse response, using fallback');
    return {
      on_track: true,
      guidance: '请继续沿当前路线前进',
      correction: null,
      summary: '模型返回格式异常，使用默认指引。',
      osm_tags: {},
      _parseFailed: true,
    };
  } catch (err) {
    console.error('[VLM-Guidance] API call failed:', err.message);
    throw err;
  }
}

module.exports = {
  analyzeImage,
  analyzeBatch,
  analyzeGuidanceFrame,
  imageToBase64Url,
  parseVlmResponse,
};
