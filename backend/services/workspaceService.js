/**
 * OSM 工作区状态查询服务
 *
 * 封装 OsmWorkState Model 的查询操作。
 */

const OsmWorkState = require('../models/OsmWorkState');

/**
 * 获取当前工作区状态（不存在则创建默认）
 */
async function getState() {
  const state = await OsmWorkState.getState();
  return state.toObject();
}

/**
 * 更新工作区状态
 * @param {object} patch — 要更新的字段
 */
async function updateState(patch) {
  const state = await OsmWorkState.getState();
  Object.assign(state, patch);
  state.updated_at = new Date();
  await state.save();
  return state;
}

module.exports = { getState, updateState };
