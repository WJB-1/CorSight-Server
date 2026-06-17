/**
 * VLM 批量推理客户端（阿里云百炼 Batch API）
 *
 * 职责：
 * - 构建 JSONL 文件
 * - 上传文件 → 创建 batch → 轮询状态 → 下载结果
 * - 解析结果 JSONL
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config/envConfig');
const { parseVlmResponse, imageToBase64Url, streamToString } = require('../lib/vlmParser');

const API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = 'qwen-vl-plus';
const POLL_INTERVAL_MS = 10000;
const MAX_WAIT_MS = 3600000;

function getClient() {
  const apiKey = config.llm.BAILIAN_API_KEY;
  if (!apiKey) throw new Error('BAILIAN_API_KEY not configured');
  return new OpenAI({ apiKey, baseURL: API_BASE });
}

/**
 * 构建 JSONL 内容
 * @param {Array<{custom_id, imagePath, prompt}>} tasks
 * @returns {string}
 */
function buildJsonl(tasks) {
  return tasks.map((task) => {
    const imageUrl = imageToBase64Url(task.imagePath);
    return JSON.stringify({
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
    });
  }).join('\n') + '\n';
}

/**
 * 上传 JSONL 文件
 * @returns {string} file_id
 */
async function uploadJsonlFile(client, jsonlContent) {
  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `batch_${Date.now()}.jsonl`);
  fs.writeFileSync(tmpPath, jsonlContent, 'utf-8');

  try {
    console.log(`[VLM-Batch] Uploading JSONL (${(jsonlContent.length / 1024).toFixed(1)}KB)`);
    const file = await client.files.create({
      file: fs.createReadStream(tmpPath),
      purpose: 'batch',
    });
    console.log(`[VLM-Batch] File uploaded: ${file.id}`);
    return file.id;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

/**
 * 创建批量任务
 */
async function createBatch(client, fileId) {
  console.log(`[VLM-Batch] Creating batch with file: ${fileId}`);
  const batch = await client.batches.create({
    input_file_id: fileId,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      ds_name: 'corsight_vlm_batch',
      ds_description: 'CorSight street-view VLM analysis',
    },
  });
  console.log(`[VLM-Batch] Batch created: ${batch.id} (status: ${batch.status})`);
  return { batch_id: batch.id, status: batch.status };
}

/**
 * 轮询 batch 状态直到完成
 */
async function pollBatchStatus(client, batchId) {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    const batch = await client.batches.retrieve(batchId);
    const progress = batch.request_counts
      ? `${batch.request_counts.completed || 0}/${batch.request_counts.total || '?'}`
      : '?';
    console.log(`[VLM-Batch] Status: ${batch.status} (${progress})`);

    if (['completed', 'failed', 'expired', 'cancelled'].includes(batch.status)) {
      return batch;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Batch ${batchId} timed out after ${MAX_WAIT_MS / 1000}s`);
}

/**
 * 下载并解析 batch 结果
 */
async function downloadBatchResults(client, batch) {
  if (batch.status !== 'completed') {
    throw new Error(`Batch not completed: ${batch.status}`);
  }
  if (!batch.output_file_id) throw new Error('No output_file_id in batch response');

  console.log(`[VLM-Batch] Downloading results: ${batch.output_file_id}`);
  const content = await client.files.content(batch.output_file_id);
  const text = await streamToString(content);

  const results = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const responseText = entry.response?.body?.choices?.[0]?.message?.content || '';
      const parsed = parseVlmResponse(responseText);
      results.push({
        custom_id: entry.custom_id,
        osm_tags: parsed?.osm_tags || {},
        description: parsed?.description || responseText.slice(0, 500),
        confidence: parsed?.confidence || 0,
      });
    } catch (_) {}
  }

  console.log(`[VLM-Batch] Downloaded ${results.length} results`);
  return results;
}

/**
 * 批量推理主入口
 * @param {Array<{custom_id, imagePath, prompt}>} tasks
 * @returns {Promise<Array<{custom_id, osm_tags, description, confidence}>>}
 */
async function submitBatch(tasks) {
  if (!tasks || tasks.length === 0) return [];

  const client = getClient();
  const t0 = Date.now();
  console.log(`[VLM-Batch] Starting: ${tasks.length} images`);

  const jsonl = buildJsonl(tasks);
  const fileId = await uploadJsonlFile(client, jsonl);
  const { batch_id } = await createBatch(client, fileId);
  const batch = await pollBatchStatus(client, batch_id);
  const results = await downloadBatchResults(client, batch);

  console.log(`[VLM-Batch] Done: ${results.length} results in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return results;
}

module.exports = { submitBatch, buildJsonl };
