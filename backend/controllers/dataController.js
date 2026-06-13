/**
 * 数据管理控制器
 *
 * GET /api/data/tags/pending    — 查询待注入标签
 * GET /api/data/tags/stats      — 标签状态统计
 * POST /api/data/inject         — 手动触发注入
 * GET /api/data/gh/status       — GraphHopper 状态
 * POST /api/data/gh/rebuild     — 手动触发重建
 * GET /api/data/workspace       — OSM 工作区状态
 */

const SemanticTag = require('../models/SemanticTag');
const OsmWorkState = require('../models/OsmWorkState');
const semanticProcessingService = require('../services/semanticProcessingService');
const graphHopperService = require('../services/graphHopperService');

/**
 * 查询待注入标签
 */
async function getPendingTags(req, res) {
  try {
    const tags = await SemanticTag.find({ status: 'pending' })
      .select('point_id location tags status created_at')
      .lean();
    return res.json({ success: true, count: tags.length, data: tags });
  } catch (err) {
    console.error('[DataController] getPendingTags error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
}

/**
 * 标签状态统计
 */
async function getTagStats(req, res) {
  try {
    const [pending, patched, failed, total] = await Promise.all([
      SemanticTag.countDocuments({ status: 'pending' }),
      SemanticTag.countDocuments({ status: 'patched' }),
      SemanticTag.countDocuments({ status: 'failed' }),
      SemanticTag.countDocuments(),
    ]);
    return res.json({
      success: true,
      data: { total, pending, patched, failed },
    });
  } catch (err) {
    console.error('[DataController] getTagStats error:', err);
    return res.status(500).json({ success: false, message: '统计失败' });
  }
}

/**
 * 手动触发注入
 * POST /api/data/inject
 * Body: { point_ids?: string[], skip_rebuild?: boolean }
 */
async function triggerInjection(req, res) {
  try {
    const { point_ids, skip_rebuild } = req.body || {};
    const options = {
      pointIds: point_ids || [],
      skipRebuild: !!skip_rebuild,
    };

    // 异步执行，立即返回
    setImmediate(() => {
      semanticProcessingService.runInjectionPipeline(options).catch((err) => {
        console.error('[DataController] Injection pipeline error:', err);
      });
    });

    return res.json({
      success: true,
      message: '注入流程已启动（异步执行）',
      options,
    });
  } catch (err) {
    console.error('[DataController] triggerInjection error:', err);
    return res.status(500).json({ success: false, message: '触发注入失败' });
  }
}

/**
 * GraphHopper 状态
 */
async function getGraphHopperStatus(req, res) {
  try {
    const ready = await graphHopperService.isReady();
    const state = await OsmWorkState.getState();
    return res.json({
      success: true,
      data: {
        ready,
        url: graphHopperService.getActiveUrl(),
        strategy: graphHopperService.getStrategyName(),
        current_pbf: state.current_pbf,
        rebuild_in_progress: state.rebuild_in_progress,
        last_rebuild_time: state.last_rebuild_time,
      },
    });
  } catch (err) {
    console.error('[DataController] getGraphHopperStatus error:', err);
    return res.status(500).json({ success: false, message: '查询 GH 状态失败' });
  }
}

/**
 * 手动触发 GraphHopper 重建
 */
async function triggerRebuild(req, res) {
  try {
    const state = await OsmWorkState.getState();
    if (state.rebuild_in_progress) {
      return res.status(409).json({ success: false, message: '重建正在进行中' });
    }

    setImmediate(() => {
      const pbfPath = require('path').join(
        require('../config/envConfig').osm.OSM_DATA_DIR,
        require('../config/envConfig').osm.OSM_WORKSPACE_PBF
      );
      graphHopperService.rebuild(pbfPath).catch((err) => {
        console.error('[DataController] Rebuild error:', err);
      });
    });

    return res.json({ success: true, message: 'GraphHopper 重建已启动' });
  } catch (err) {
    console.error('[DataController] triggerRebuild error:', err);
    return res.status(500).json({ success: false, message: '触发重建失败' });
  }
}

/**
 * OSM 工作区状态
 */
async function getWorkspaceStatus(req, res) {
  try {
    const state = await OsmWorkState.getState();
    return res.json({ success: true, data: state.toObject() });
  } catch (err) {
    console.error('[DataController] getWorkspaceStatus error:', err);
    return res.status(500).json({ success: false, message: '查询工作区状态失败' });
  }
}

module.exports = {
  getPendingTags,
  getTagStats,
  triggerInjection,
  getGraphHopperStatus,
  triggerRebuild,
  getWorkspaceStatus,
};
