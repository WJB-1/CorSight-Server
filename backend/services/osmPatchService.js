/**
 * OSM 补丁服务
 *
 * 职责：
 * 1. 调用 Python 脚本生成 OSC 补丁
 * 2. 调用 osmium 应用补丁到工作区
 * 3. 调用 osmium 生成最终 PBF
 * 4. 更新 SemanticTag 状态
 *
 * 依赖方向：service → model（无反向依赖）
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const config = require('../config/envConfig');
const SemanticTag = require('../models/SemanticTag');

const execFileAsync = promisify(execFile);
const osmConfig = config.osm;

/**
 * 确保城市级工作区 OSM 存在
 * 如果不存在，从 base PBF 按 bbox 裁剪
 *
 * 默认裁剪广州市范围（113.1,22.9,113.6,23.4）
 * 可通过 OSM_CITY_BBOX 环境变量自定义
 */
async function ensureWorkspace() {
  const workspacePath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  if (fs.existsSync(workspacePath)) {
    return workspacePath;
  }

  const basePath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_BASE_PBF);
  if (!fs.existsSync(basePath)) {
    throw new Error(`Base PBF not found: ${basePath}`);
  }

  const bbox = config.getEnv('OSM_CITY_BBOX', '113.1,22.9,113.6,23.4');
  console.log(`[OsmPatch] Extracting city area (bbox: ${bbox}) from ${osmConfig.OSM_BASE_PBF}...`);
  await execFileAsync(osmConfig.OSMIUM_PATH, [
    'extract', '--bbox', bbox, '--strategy', 'complete_ways',
    basePath, '-o', workspacePath,
  ]);
  console.log(`[OsmPatch] City workspace created: ${workspacePath}`);

  // 同时生成 PBF
  const pbfPath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE_PBF);
  if (!fs.existsSync(pbfPath)) {
    await execFileAsync(osmConfig.OSMIUM_PATH, ['cat', workspacePath, '-o', pbfPath]);
    console.log(`[OsmPatch] City PBF created: ${pbfPath}`);
  }

  return workspacePath;
}

/**
 * Step 1: 获取待注入的标签
 * @returns {Array} pending 标签列表
 */
async function getPendingTags() {
  return SemanticTag.findPending();
}

/**
 * Step 2: 调用 Python 脚本生成 OSC 补丁
 * @param {string[]} pointIds
 * @returns {object} { status, matched, unmatched, errors, output_file }
 */
async function generateOscPatch(pointIds) {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'generate_osc.py');
  const workspacePath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const oscOutput = path.join(osmConfig.OSM_DATA_DIR, 'changes_new.osc');

  const args = [
    scriptPath,
    '--mongodb-uri', config.database.MONGODB_URI,
    '--osm-file', workspacePath,
    '--output', oscOutput,
  ];
  if (pointIds.length > 0) {
    args.push('--point-ids', pointIds.join(','));
  }

  console.log(`[OsmPatch] Generating OSC patch for ${pointIds.length} points...`);
  const { stdout, stderr } = await execFileAsync(osmConfig.PYTHON_PATH, args, { timeout: 120000 });

  if (stderr) {
    console.warn(`[OsmPatch] Python stderr: ${stderr}`);
  }

  // 解析最后一行 JSON 输出
  const lines = stdout.trim().split('\n');
  let result;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      result = JSON.parse(lines[i]);
      break;
    } catch (_) { /* skip non-JSON lines */ }
  }

  if (!result) {
    throw new Error('Python script returned no valid JSON result');
  }

  return result;
}

/**
 * Step 3: 应用 OSC 补丁到 workspace.osm
 * @returns {string} 更新后的 workspace 路径
 */
async function applyOscPatch() {
  const workspacePath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const oscPath = path.join(osmConfig.OSM_DATA_DIR, 'changes_new.osc');
  const updatedPath = path.join(osmConfig.OSM_DATA_DIR, 'workspace_updated.osm');
  const backupPath = path.join(osmConfig.OSM_DATA_DIR, 'workspace.osm.backup');

  if (!fs.existsSync(oscPath)) {
    throw new Error(`OSC file not found: ${oscPath}`);
  }

  // 检查 OSC 是否只有空壳（占位脚本生成的）
  const oscContent = fs.readFileSync(oscPath, 'utf-8');
  if (oscContent.includes('<!-- placeholder')) {
    console.log(`[OsmPatch] OSC is placeholder, skipping apply`);
    return null; // 表示没有实际变更
  }

  console.log(`[OsmPatch] Applying OSC patch...`);
  await execFileAsync(osmConfig.OSMIUM_PATH, [
    'apply-changes', workspacePath, oscPath, '-o', updatedPath,
  ]);

  // 备份原文件
  if (fs.existsSync(workspacePath)) {
    fs.copyFileSync(workspacePath, backupPath);
  }

  // 替换工作区
  fs.copyFileSync(updatedPath, workspacePath);
  fs.unlinkSync(updatedPath);

  // 保存 OSC 到历史目录
  const historyDir = path.join(osmConfig.OSM_DATA_DIR, 'history_osc');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  const historyName = `changes_${Date.now()}.osc`;
  fs.copyFileSync(oscPath, path.join(historyDir, historyName));

  console.log(`[OsmPatch] Patch applied, backup saved`);
  return workspacePath;
}

/**
 * Step 4: 生成最终 PBF（供 GraphHopper 使用）
 * @returns {string} PBF 文件路径
 */
async function generatePbf() {
  const workspacePath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE);
  const pbfPath = path.join(osmConfig.OSM_DATA_DIR, osmConfig.OSM_WORKSPACE_PBF);

  console.log(`[OsmPatch] Generating PBF: ${osmConfig.OSM_WORKSPACE_PBF}`);
  await execFileAsync(osmConfig.OSMIUM_PATH, ['cat', workspacePath, '-o', pbfPath]);
  console.log(`[OsmPatch] PBF generated: ${pbfPath}`);

  return pbfPath;
}

/**
 * 完整注入流程（供外部调用）
 *
 * @param {object} options
 * @param {string[]} [options.pointIds] — 指定 point_id 列表，空则处理全部 pending
 * @returns {object} { matched, patched, failed, skipped }
 */
async function runInjection(options = {}) {
  const pointIds = options.pointIds || [];

  // Step 1: 获取待注入标签
  const pendingTags = pointIds.length > 0
    ? await SemanticTag.find({ point_id: { $in: pointIds }, status: 'pending' }).lean()
    : await getPendingTags();

  if (pendingTags.length === 0) {
    console.log(`[OsmPatch] No pending tags to inject`);
    return { matched: 0, patched: 0, failed: 0, skipped: 0 };
  }

  const ids = pendingTags.map((t) => t.point_id);
  console.log(`[OsmPatch] Injecting ${ids.length} tags: ${ids.join(', ')}`);

  try {
    // Step 2: 生成 OSC 补丁
    const oscResult = await generateOscPatch(ids);

    // Step 3: 应用补丁
    const applied = await applyOscPatch();
    if (!applied) {
      // 占位脚本，没有实际变更
      return { matched: 0, patched: 0, failed: 0, skipped: ids.length };
    }

    // Step 4: 生成 PBF
    await generatePbf();

    // Step 5: 更新状态（Python 脚本已经回写了匹配信息，这里标记 patched）
    for (const tag of pendingTags) {
      if (tag.matched_osm_id) {
        await SemanticTag.markPatched(tag.point_id, {
          osm_id: tag.matched_osm_id,
          osm_type: tag.matched_osm_type,
          distance_m: tag.match_distance_m,
        });
      }
    }

    console.log(`[OsmPatch] Injection complete`);
    return {
      matched: oscResult.matched || 0,
      patched: ids.length,
      failed: 0,
      skipped: 0,
    };
  } catch (err) {
    console.error(`[OsmPatch] Injection failed:`, err.message);
    // 标记全部失败
    for (const id of ids) {
      await SemanticTag.markFailed(id, err.message).catch((e) => {
        console.warn(`[OsmPatch] Failed to mark ${id} as failed:`, e.message);
      });
    }
    throw err;
  }
}

module.exports = {
  ensureWorkspace,
  getPendingTags,
  generateOscPatch,
  applyOscPatch,
  generatePbf,
  runInjection,
};
