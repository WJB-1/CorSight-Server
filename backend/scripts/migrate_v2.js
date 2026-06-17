/**
 * v1 → v2 数据格式迁移脚本
 *
 * 迁移内容：
 * 1. semantic_tags: tags(扁平) → images[] + merged_osm_tags + merged_description
 * 2. pending_uploads: 补充 fov/scene_type/status/batch_id 缺失字段
 * 3. sampling_points (54条): 旧格式 → 写入 semantic_tags（v2 新格式）
 * 4. samplingpoints (33条): 旧格式 → 写入 semantic_tags（v2 新格式）
 *
 * 用法：
 *   node scripts/migrate_v2.js
 */

require('dotenv').config({ override: false, silent: true });
const mongoose = require('mongoose');
const config = require('../config/envConfig');

// 方位字母 → bearing 度数
const DIRECTION_TO_BEARING = {
  N: 0, NE: 45, E: 90, SE: 135,
  S: 180, SW: 225, W: 270, NW: 315,
};

/** 默认 FOV（旧数据没有 FOV 信息） */
const DEFAULT_FOV = 90;

/**
 * 将 v1 的 images 对象 {N: path, NE: path, ...} 转为 v2 的 images 数组
 */
function convertV1Images(imagesObj) {
  if (!imagesObj || typeof imagesObj !== 'object') return [];

  return Object.entries(imagesObj)
    .filter(([dir, path]) => path && DIRECTION_TO_BEARING[dir] !== undefined)
    .map(([dir, imgPath]) => {
      // 统一路径前缀：确保以 /images/ 开头
      let normalizedPath = imgPath;
      if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
      }
      // samplingpoints 用的是 images/xxx.jpg，sampling_points 用的是 /images/xxx.jpg
      // 统一为 /images/xxx.jpg
      if (normalizedPath.startsWith('/images/')) {
        // OK
      } else if (normalizedPath.startsWith('/public/images/')) {
        normalizedPath = normalizedPath.replace('/public/', '/');
      }

      return {
        bearing: DIRECTION_TO_BEARING[dir],
        fov: DEFAULT_FOV,
        path: normalizedPath,
        scene_type: null,        // 未经过 VLM 分类
        osm_tags: {},            // 未经过 VLM 分析
        description: '',         // 未经过 VLM 分析
        confidence: null,
      };
    });
}

// ── 1. 迁移 semantic_tags 内部格式 ────────────────

async function migrateSemanticTags(db) {
  const col = db.collection('semantic_tags');
  const docs = await col.find({}).toArray();
  console.log(`[Migrate] semantic_tags: ${docs.length} documents`);

  let migrated = 0;
  for (const doc of docs) {
    const update = {};

    // tags → merged_osm_tags
    if (doc.tags && typeof doc.tags === 'object' && Object.keys(doc.tags).length > 0) {
      if (!doc.merged_osm_tags || Object.keys(doc.merged_osm_tags).length === 0) {
        update.merged_osm_tags = { ...doc.tags };
      }
    }

    // images 字符串数组 → 结构化数组
    if (Array.isArray(doc.images) && doc.images.length > 0 && typeof doc.images[0] === 'string') {
      update.images = doc.images.map((imgPath) => {
        const basename = imgPath.split('/').pop().split('.')[0];
        const parts = basename.split('_');
        let bearing = 0;
        if (parts.length >= 3) {
          const maybeBearing = parseInt(parts[parts.length - 2], 10);
          if (!isNaN(maybeBearing) && maybeBearing >= 0 && maybeBearing <= 360) {
            bearing = maybeBearing;
          }
        }
        return { bearing, fov: DEFAULT_FOV, path: imgPath, scene_type: null, osm_tags: {}, description: '', confidence: null };
      });
    }

    // 确保新字段存在
    if (!doc.merged_osm_tags) update.merged_osm_tags = {};
    if (!doc.merged_description) update.merged_description = doc.scene_description || '';
    if (doc.status === undefined) update.status = 'pending';
    if (doc.error === undefined) update.error = null;
    if (doc.matched_osm_id === undefined) update.matched_osm_id = null;
    if (doc.matched_osm_type === undefined) update.matched_osm_type = null;
    if (doc.match_distance_m === undefined) update.match_distance_m = null;

    // 删除旧 tags 字段
    const unset = {};
    if (doc.tags !== undefined) unset.tags = '';

    if (Object.keys(update).length > 0 || Object.keys(unset).length > 0) {
      const ops = {};
      if (Object.keys(update).length > 0) ops.$set = update;
      if (Object.keys(unset).length > 0) ops.$unset = unset;
      await col.updateOne({ _id: doc._id }, ops);
      migrated++;
      console.log(`  [${doc.point_id}] migrated`);
    } else {
      console.log(`  [${doc.point_id}] already up to date`);
    }
  }
  return migrated;
}

// ── 2. 迁移 pending_uploads ──────────────────────

async function migratePendingUploads(db) {
  const col = db.collection('pending_uploads');
  const docs = await col.find({}).toArray();
  console.log(`\n[Migrate] pending_uploads: ${docs.length} documents`);

  let migrated = 0;
  for (const doc of docs) {
    const update = {};

    if (doc.images && typeof doc.images === 'object') {
      let needsUpdate = false;
      const newImages = {};
      for (const [bearing, img] of Object.entries(doc.images)) {
        const newImg = { ...img };
        if (newImg.fov === undefined) { newImg.fov = DEFAULT_FOV; needsUpdate = true; }
        if (newImg.scene_type === undefined) { newImg.scene_type = null; needsUpdate = true; }
        if (newImg.scene_context === undefined) { newImg.scene_context = null; needsUpdate = true; }
        if (newImg.status === undefined) { newImg.status = 'pending'; needsUpdate = true; }
        newImages[bearing] = newImg;
      }
      if (needsUpdate) update.images = newImages;
    }

    if (doc.batch_id === undefined) update.batch_id = null;

    if (Object.keys(update).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: update });
      migrated++;
      console.log(`  [${doc.session_id}] migrated`);
    } else {
      console.log(`  [${doc.session_id}] already up to date`);
    }
  }
  return migrated;
}

// ── 3. sampling_points → semantic_tags ────────────

async function migrateSamplingPoints(db) {
  const srcCol = db.collection('sampling_points');
  const dstCol = db.collection('semantic_tags');
  const docs = await srcCol.find({}).toArray();
  console.log(`\n[Migrate] sampling_points → semantic_tags: ${docs.length} documents`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const pointId = doc.point_id;
    if (!pointId) { skipped++; continue; }

    // 检查 semantic_tags 中是否已存在
    const existing = await dstCol.findOne({ point_id: pointId });
    if (existing) {
      console.log(`  [${pointId}] already exists in semantic_tags, skipped`);
      skipped++;
      continue;
    }

    // 构建 location
    let location = doc.location;
    if (!location && doc.location?.coordinates) {
      location = doc.location;
    }

    // 构建 images 数组
    const images = convertV1Images(doc.images);

    // 写入 semantic_tags
    await dstCol.insertOne({
      point_id: pointId,
      location: location || { type: 'Point', coordinates: [0, 0] },
      scene_description: doc.scene_description || '',
      images,
      merged_osm_tags: {},
      merged_description: doc.scene_description || '',
      matched_osm_id: null,
      matched_osm_type: null,
      match_distance_m: null,
      status: 'pending',
      error: null,
      created_at: doc.createdAt || new Date(),
      updated_at: new Date(),
    });

    migrated++;
    console.log(`  [${pointId}] migrated (${images.length} images)`);
  }

  return migrated;
}

// ── 4. samplingpoints → semantic_tags ─────────────

async function migrateSamplingpoints(db) {
  const srcCol = db.collection('samplingpoints');
  const dstCol = db.collection('semantic_tags');
  const docs = await srcCol.find({}).toArray();
  console.log(`\n[Migrate] samplingpoints → semantic_tags: ${docs.length} documents`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const pointId = doc.point_id;
    if (!pointId) { skipped++; continue; }

    // 检查是否已存在（sampling_points 可能已经迁过了同名的）
    const existing = await dstCol.findOne({ point_id: pointId });
    if (existing) {
      console.log(`  [${pointId}] already exists in semantic_tags, skipped`);
      skipped++;
      continue;
    }

    // samplingpoints 可能没有 location 字段，需要从 longitude/latitude 构建
    let location = doc.location;
    if (!location && doc.longitude !== undefined && doc.latitude !== undefined) {
      location = { type: 'Point', coordinates: [doc.longitude, doc.latitude] };
    }

    const images = convertV1Images(doc.images);

    await dstCol.insertOne({
      point_id: pointId,
      location: location || { type: 'Point', coordinates: [0, 0] },
      scene_description: doc.scene_description || '',
      images,
      merged_osm_tags: {},
      merged_description: doc.scene_description || '',
      matched_osm_id: null,
      matched_osm_type: null,
      match_distance_m: null,
      status: 'pending',
      error: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    migrated++;
    console.log(`  [${pointId}] migrated (${images.length} images)`);
  }

  return migrated;
}

// ── 主流程 ───────────────────────────────────────

async function main() {
  console.log('=== CorSight v2 数据迁移 ===\n');
  console.log(`MongoDB: ${config.database.MONGODB_URI}`);

  await mongoose.connect(config.database.MONGODB_URI);
  const db = mongoose.connection.db;

  const semCount = await migrateSemanticTags(db);
  const pendCount = await migratePendingUploads(db);
  const spCount = await migrateSamplingPoints(db);
  const sp2Count = await migrateSamplingpoints(db);

  // 统计最终结果
  const totalTags = await db.collection('semantic_tags').countDocuments({});

  console.log(`\n=== 迁移完成 ===`);
  console.log(`  semantic_tags 内部格式更新:  ${semCount} 条`);
  console.log(`  pending_uploads 字段补全:    ${pendCount} 条`);
  console.log(`  sampling_points → semantic_tags: ${spCount} 条`);
  console.log(`  samplingpoints → semantic_tags:  ${sp2Count} 条`);
  console.log(`  semantic_tags 总计:              ${totalTags} 条`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
