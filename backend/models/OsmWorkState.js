/**
 * OSM 工作区状态（单例文档，协调乒乓切换）
 *
 * 始终只有一条记录：_id = 'current_state'
 */

const mongoose = require('mongoose');

const osmWorkStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'current_state' },
    current_pbf: { type: String, default: 'workspace.pbf' },
    current_cache: { type: String, default: 'graph-cache-guangzhou' },
    pending_pbf: { type: String, default: null },
    pending_cache: { type: String, default: null },
    last_patch_time: { type: Date, default: null },
    last_rebuild_time: { type: Date, default: null },
    rebuild_in_progress: { type: Boolean, default: false },
  },
  { _id: false, collection: 'osm_working_state' }
);

/**
 * 获取当前状态（不存在则创建默认）
 */
osmWorkStateSchema.statics.getState = async function () {
  let state = await this.findById('current_state');
  if (!state) {
    state = await this.create({ _id: 'current_state' });
  }
  return state;
};

const OsmWorkState = mongoose.model('OsmWorkState', osmWorkStateSchema, 'osm_working_state');

module.exports = OsmWorkState;
