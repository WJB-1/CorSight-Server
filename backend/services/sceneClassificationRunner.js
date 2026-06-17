/**
 * 场景分类执行器
 *
 * 从 batchProcessorService 中提取。
 * 逐张图片做视野扇区计算 → OSM 检索 → 场景分类 → 回写 session。
 */

const mongoose = require('mongoose');
const viewSectorService = require('./viewSectorService');
const sceneClassifier = require('./sceneClassifier');

/**
 * 对 session 中的每张图片执行场景分类
 * @param {object} session - Mongoose UploadSession 文档
 * @returns {Promise<void>}
 */
async function classifySessionImages(session) {
  const [lon, lat] = session.location.coordinates;

  for (const [bearingKey, img] of session.images) {
    if (!img.uploaded || !img.path) continue;

    // 1. 计算视野扇区
    const sector = viewSectorService.computeSector(lon, lat, Number(bearingKey), img.fov || 90);

    // 2. 扇区内 OSM 元素检索（MongoDB osm_ways）
    let osmElements = [];
    try {
      const OsmWay = mongoose.connection.collection('osm_ways');
      const results = await OsmWay.find({
        geometry: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lon, lat] },
            $maxDistance: 50,
          },
        },
      }).limit(10).toArray();
      osmElements = results.map((r) => ({
        osm_id: r.osm_id,
        osm_type: r.osm_type || 'way',
        tags: r.tags || {},
      }));
    } catch (err) {
      console.warn(`[SceneClassifier] OSM lookup failed for ${session.session_id}/${bearingKey}:`, err.message);
    }

    // 3. 场景分类
    const classification = sceneClassifier.classify(osmElements);

    // 4. 回写
    img.scene_type = classification.scene_type;
    img.scene_context = classification.context;
    img.status = 'classified';
  }

  session.updated_at = new Date();
  await session.save();
}

module.exports = { classifySessionImages };
