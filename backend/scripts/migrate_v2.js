/**
 * v1 → v2 数据格式迁移脚本
 *
 * 迁移内容：
 * 1. semantic_tags: tags(扁平) → images[] + merged_osm_tags + merged_description
 * 2. pending_uploads: 补充 fov/scene_type/status/batch_id 缺失字段
 *
 * 用法：
 *   node scripts/migrate_v2.js
 */

require('dotenv').config({ override: false, silent: true });
const mongoose = require('mongoose');
const config = require('../config/envConfig');

const SEMANTIC_TAGS_NEW_SCHEMA = {
  images: [],              // Array<{bearing, fov, path, scene_type, osm_tags, description}>
  merged_osm_tags: {},     // 合并后的 OSM 标签
  merged_description: '',  // 合并后的描述
  matched_osm_id: null,
  matched_osm_type: null,
  match_distance_m: null,
  status: 'pending',
  error: null,
};

async function migrateSemanticTags(db) {
  const col = db.collection('semantic_tags');
  const docs = await col.find({}).toArray();
  console.log(`[Migrate] semantic_tags: ${docs.length} documents`);

  let migrated = 0;
  for (const doc of docs) {
    const update = {};

    // ── 迁移 tags → merged_osm_tags ──────────────
    if (doc.tags && typeof doc.tags === 'object' && Object.keys(doc.tags).length > 0) {
      if (!doc.merged_osm_tags || Object.keys(doc.merged_osm_tags).length === 0) {
        update.merged_osm_tags = { ...doc.tags };
      }
    }

    // ── 迁移 images：字符串数组 → 结构化数组 ─────
    if (Array.isArray(doc.images) && doc.images.length > 0) {
      const isOldFormat = typeof doc.images[0] === 'string';
      if (isOldFormat) {
        // 从文件名解析 bearing：P_xxx_{bearing}_{timestamp}.jpg
        update.images = doc.images.map((imgPath) => {
          const basename = imgPath.split('/').pop().split('.')[0];
          const parts = basename.split('_');
          // 尝试提取 bearing（倒数第二个部分，如果文件名格式是 P_xxx_{bearing}_{ts}）
          let bearing = 0;
          if (parts.length >= 3) {
            const maybeBearing = parseInt(parts[parts.length - 2], 10);
            if (!isNaN(maybeBearing) && maybeBearing >= 0 && maybeBearing <= 360) {
              bearing = maybeBearing;
            }
          }
          return {
            bearing,
            fov: 90,
            path: imgPath,
            scene_type: null,
            osm_tags: {},
            description: '',
            confidence: null,
          };
        });
      }
    }

    // ── 确保新字段存在 ───────────────────────────
    if (!doc.merged_osm_tags) update.merged_osm_tags = {};
    if (!doc.merged_description) update.merged_description = doc.scene_description || '';
    if (doc.status === undefined) update.status = 'pending';
    if (doc.error === undefined) update.error = null;
    if (doc.matched_osm_id === undefined) update.matched_osm_id = null;
    if (doc.matched_osm_type === undefined) update.matched_osm_type = null;
    if (doc.match_distance_m === undefined) update.match_distance_m = null;

    // ── 删除旧 tags 字段 ─────────────────────────
    const unset = {};
    if (doc.tags !== undefined) unset.tags = '';

    if (Object.keys(update).length > 0 || Object.keys(unset).length > 0) {
      const ops = {};
      if (Object.keys(update).length > 0) ops.$set = update;
      if (Object.keys(unset).length > 0) ops.$unset = unset;

      await col.updateOne({ _id: doc._id }, ops);
      migrated++;
      console.log(`  [${doc.point_id}] migrated (set: ${Object.keys(update).length}, unset: ${Object.keys(unset).length})`);
    } else {
      console.log(`  [${doc.point_id}] already up to date`);
    }
  }

  return migrated;
}

async function migratePendingUploads(db) {
  const col = db.collection('pending_uploads');
  const docs = await col.find({}).toArray();
  console.log(`\n[Migrate] pending_uploads: ${docs.length} documents`);

  let migrated = 0;
  for (const doc of docs) {
    const update = {};

    // 检查 images 中每个 entry 是否缺少新字段
    if (doc.images && typeof doc.images === 'object') {
      let needsUpdate = false;
      const newImages = {};

      for (const [bearing, img] of Object.entries(doc.images)) {
        const newImg = { ...img };
        if (newImg.fov === undefined) { newImg.fov = 90; needsUpdate = true; }
        if (newImg.scene_type === undefined) { newImg.scene_type = null; needsUpdate = true; }
        if (newImg.scene_context === undefined) { newImg.scene_context = null; needsUpdate = true; }
        if (newImg.status === undefined) { newImg.status = img.uploaded ? 'pending' : 'pending'; needsUpdate = true; }
        newImages[bearing] = newImg;
      }

      if (needsUpdate) {
        update.images = newImages;
      }
    }

    // 补充 batch_id
    if (doc.batch_id === undefined) {
      update.batch_id = null;
    }

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

async function main() {
  console.log('=== CorSight v2 数据迁移 ===\n');
  console.log(`MongoDB: ${config.database.MONGODB_URI}`);

  await mongoose.connect(config.database.MONGODB_URI);
  const db = mongoose.connection.db;

  const semCount = await migrateSemanticTags(db);
  const pendCount = await migratePendingUploads(db);

  console.log(`\n=== 迁移完成 ===`);
  console.log(`  semantic_tags:  ${semCount} documents migrated`);
  console.log(`  pending_uploads: ${pendCount} documents migrated`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
