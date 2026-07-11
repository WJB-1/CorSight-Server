/**
 * VLM 任务构建 + 结果回写
 *
 * 从 batchProcessorService 中提取。
 * 构建 VLM 任务列表（提示词 + 图片路径），回写结果到 session。
 */

const promptLoader = require('../prompts/promptLoader');
const vlmService = require('./vlmService');
const tagMergeService = require('./tagMergeService');
const SemanticTag = require('../models/SemanticTag');

/**
 * 构建 VLM 任务列表
 * @param {object} session - Mongoose UploadSession 文档
 * @returns {Array<{custom_id, sessionId, bearingKey, imagePath, prompt, sceneType}>}
 */
function buildVlmTasks(session) {
  const tasks = [];

  for (const [bearingKey, img] of session.images) {
    if (!img.uploaded || !img.path || img.status !== 'classified') continue;

    const sceneType = img.scene_type || 'generic';
    const customId = `${session.point_id}_${bearingKey}`;

    let prompt = '';
    try {
      prompt = promptLoader.load(sceneType, {
        osm_context: JSON.stringify(img.scene_context || {}),
      });
    } catch (err) {
      console.warn(`[VlmTaskBuilder] Prompt load failed for ${sceneType}:`, err.message);
    }

    tasks.push({ custom_id: customId, sessionId: session.session_id, bearingKey, imagePath: img.path, prompt, sceneType });
  }

  return tasks;
}

/**
 * 回写 VLM 结果到 session 并持久化 SemanticTag
 * @param {object} session
 * @param {Map<string,object>} resultMap - custom_id → vlm result
 */
async function writebackResults(session, resultMap) {
  // 回写到 session.images
  for (const [bearingKey, img] of session.images) {
    if (!img.uploaded || img.status !== 'classified') continue;

    const customId = `${session.point_id}_${bearingKey}`;
    const vlmResult = resultMap.get(customId);

    if (vlmResult) {
      img.scene_context = {
        ...img.scene_context,
        vlm_osm_tags: vlmResult.osm_tags || {},
        vlm_description: vlmResult.description || '',
        vlm_confidence: vlmResult.confidence || 0,
      };
      img.status = 'processed';
    }
  }

  // 构建 SemanticTag.images 数组
  const imagesArray = [];
  for (const [bearingKey, img] of session.images) {
    if (!img.uploaded || !img.path) continue;
    imagesArray.push({
      bearing: Number(bearingKey),
      fov: img.fov || 90,
      path: img.path,
      scene_type: img.scene_type,
      osm_tags: (img.scene_context && img.scene_context.vlm_osm_tags) || {},
      description: (img.scene_context && img.scene_context.vlm_description) || '',
      confidence: (img.scene_context && img.scene_context.vlm_confidence) || 0,
    });
  }

  // 合并标签
  const merged = tagMergeService.mergeAll(imagesArray);

  // 更新已存在的 SemanticTag（上传时已创建，这里回填 VLM 分析结果）
  await SemanticTag.findOneAndUpdate(
    { point_id: session.point_id },
    {
      $set: {
        images: imagesArray,
        merged_osm_tags: merged.osm_tags,
        merged_description: merged.description,
        status: 'analyzed',
        updated_at: new Date(),
      },
    }
  );

  session.status = 'done';
  session.updated_at = new Date();
  await session.save();
}

module.exports = { buildVlmTasks, writebackResults };
