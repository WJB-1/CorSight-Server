/**
 * 标签合并服务
 *
 * 将同一采集点多张图片的独立分析结果，融合为：
 * 1. merged_osm_tags — 用于注入 OSM 的合并标签（多数投票 + 冲突解决）
 * 2. merged_description — 用于路线预览 RAG 的合并描述
 */

/**
 * 合并多张图片的 OSM 标签（多数投票）
 *
 * @param {Array<{osm_tags: object}>} images
 * @returns {object} 合并后的 osm_tags
 */
function mergeOsmTags(images) {
  if (!images || images.length === 0) return {};

  if (images.length === 1) return { ...images[0].osm_tags };

  // 收集每个 key 的所有值
  const valueCounts = {};
  for (const img of images) {
    if (!img.osm_tags) continue;
    for (const [key, value] of Object.entries(img.osm_tags)) {
      if (value === null || value === undefined || value === '') continue;
      if (!valueCounts[key]) valueCounts[key] = {};
      const v = String(value);
      valueCounts[key][v] = (valueCounts[key][v] || 0) + 1;
    }
  }

  // 每个 key 取出现次数最多的值
  const merged = {};
  for (const [key, counts] of Object.entries(valueCounts)) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    merged[key] = sorted[0][0]; // 出现最多的值
  }

  return merged;
}

/**
 * 合并多张图片的描述文本
 *
 * @param {Array<{bearing: number, description: string, scene_type: string}>} images
 * @param {string} [delimiter='\n'] - 分隔符
 * @returns {string} 合并后的描述
 */
function mergeDescriptions(images, delimiter = '\n') {
  if (!images || images.length === 0) return '';

  // 过滤掉空描述，按 bearing 排序
  const valid = images
    .filter((img) => img.description && img.description.trim())
    .sort((a, b) => a.bearing - b.bearing);

  if (valid.length === 0) return '';
  if (valid.length === 1) return valid[0].description;

  return valid.map((img) => img.description.trim()).join(delimiter);
}

/**
 * 一站式合并：输入图片数组，输出合并结果
 *
 * @param {Array<{bearing, fov, path, scene_type, osm_tags, description, confidence}>} images
 * @returns {{ osm_tags: object, description: string }}
 */
function mergeAll(images) {
  return {
    osm_tags: mergeOsmTags(images),
    description: mergeDescriptions(images),
  };
}

module.exports = {
  mergeOsmTags,
  mergeDescriptions,
  mergeAll,
};
