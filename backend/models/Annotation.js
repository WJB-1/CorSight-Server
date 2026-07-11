/**
 * 文旅标注模型 — 红色村落视障旅游助手
 *
 * 支持两种节点类型：
 * - poi（兴趣点）：Polygon 围栏区域，用户停留听知识讲解
 * - path（道路）：LineString 路径线段，用户在行进中听导航指引
 *
 * 坐标系：GCJ-02（高德底图），与地图显示一致。
 */

const mongoose = require('mongoose');

// ── 子文档：小物件（POI 下的可识别物品） ──────────
const subItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  position:    { type: [Number] },             // [lng, lat]
  description: { type: String },
  visual_clue: { type: String },               // VLM 识别线索
}, { _id: true });

// ── 子文档：故事 ──────────────────────────────────
const storySchema = new mongoose.Schema({
  title:   { type: String, required: true },
  content: { type: String },
}, { _id: true });

// ── 子文档：关键节点（Path 的 waypoint） ──────────
const waypointSchema = new mongoose.Schema({
  seq:         { type: Number, required: true },
  position:    { type: [Number], required: true },  // [lng, lat]
  description: { type: String },
  action:      { type: String },                     // 'turn_left' | 'turn_right' | 'pass_by' | 'arrive'
  visual_clue: { type: String },
}, { _id: true });

// ── 主 Schema ─────────────────────────────────────
const annotationSchema = new mongoose.Schema(
  {
    // ── 顶层分类 ────────────────────────────────
    node_type: {
      type: String,
      enum: ['poi', 'path'],
      default: 'poi',
    },

    // ── 几何数据 ────────────────────────────────
    type: { type: String, enum: ['Polygon', 'LineString'], required: true },
    geometry: { type: mongoose.Schema.Types.Mixed, required: true },

    // ── 标识 ────────────────────────────────────
    label:    { type: String, maxlength: 100 },
    category: {
      type: String,
      enum: ['heritage', 'residence', 'landmark', 'memorial', 'scenery', 'facility', 'other'],
      default: 'heritage',
    },

    // ── POI 字段：触发 ──────────────────────────
    trigger_radius: { type: Number, default: 20 },  // GPS 触发半径（米）

    // ── POI 字段：知识图谱 ──────────────────────
    knowledge: {
      summary:           { type: String },             // 概述
      stories:           { type: [storySchema] },     // 故事列表
      sub_items:         { type: [subItemSchema] },   // 小物件列表
      related_people:    { type: [String] },          // 关联人物
      historical_period: { type: String },            // 历史时期（如 "1920-1949"）
    },

    // ── Path 字段：关键节点 ─────────────────────
    waypoints:  { type: [waypointSchema] },           // 路径关键节点（有序）
    surface:    { type: String },                      // 路面类型: gravel/stone/dirt/paved
    difficulty: { type: String },                      // 难度: easy/medium/hard

    // ── 讲解提示词 ──────────────────────────────
    prompts: {
      welcome: { type: String },  // POI 到达开场白
      detail:  { type: String },  // POI 子物件讲解
      story:   { type: String },  // POI 故事讲述
      turn:    { type: String },  // Path 拐弯提醒
      arrive:  { type: String },  // Path 到达提醒
    },

    // ── 遗留字段（兼容旧数据） ──────────────────
    point_id:    { type: String, default: null },
    description: { type: String, maxlength: 500 },
    zoom:        { type: Number },
    deleted:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── 索引 ──────────────────────────────────────────
annotationSchema.index({ category: 1, node_type: 1, deleted: 1 });
annotationSchema.index({ point_id: 1 });

module.exports = mongoose.model('Annotation', annotationSchema);
