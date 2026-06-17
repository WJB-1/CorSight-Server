/**
 * 坐标偏移调试模块
 *
 * 受页面上的 🐛调试 开关控制。
 * 开关打开时渲染调试图层，关闭时清除。
 *
 * 扩展方式：
 * - 新增校准样本 → CALIBRATION_SAMPLES 数组
 * - 新增调试图层 → 在 debugModules 数组中注册
 * - 改颜色 → COLORS 对象
 */

import { renderDebugCalibration, clearDebugCalibration } from './map.js';
import { addTextLog } from './console.js';

// ── 校准样本 ─────────────────────────────────────

const CALIBRATION_SAMPLES = [
  {
    label: '大学城A',
    db_lng: 113.36638, db_lat: 23.04656,
    real_lng: 113.37202, real_lat: 23.04373,
  },
  // 新增样本写在这里：
  // { label: '天河B', db_lng: ..., db_lat: ..., real_lng: ..., real_lat: ... },
];

// ── 颜色配置 ─────────────────────────────────────

const COLORS = {
  db: '#e63946',         // 红色：DB 原始坐标
  calibrated: '#2a9d8f', // 绿色：校准后坐标
  line: '#e9c46a',       // 黄色：偏移连线
};

// ── 状态 ─────────────────────────────────────────

let debugEnabled = false;
let cachedPoints = null;

// ── 初始化：绑定开关事件 ─────────────────────────

export function initDebugToggle() {
  const checkbox = document.getElementById('opt-debug');
  if (!checkbox) return;

  checkbox.addEventListener('change', () => {
    debugEnabled = checkbox.checked;
    if (debugEnabled && cachedPoints) {
      renderAll(cachedPoints);
      addTextLog('[调试] 调试模式已开启', 'warn');
    } else {
      clearDebugCalibration();
      addTextLog('[调试] 调试模式已关闭', 'info');
    }
  });
}

// ── 主入口：存储数据，开关打开时渲染 ─────────────

export function runCoordDebug(allPoints) {
  cachedPoints = allPoints;
  // 开关关闭时不渲染，只缓存数据
  if (!debugEnabled) return;
  renderAll(allPoints);
}

// ── 内部渲染逻辑 ─────────────────────────────────

function renderAll(allPoints) {
  if (!CALIBRATION_SAMPLES.length || !allPoints) return;

  // 1. 计算系统偏移量
  const offsets = CALIBRATION_SAMPLES.map((s) => ({
    lng: s.real_lng - s.db_lng,
    lat: s.real_lat - s.db_lat,
  }));
  const avgOffsetLng = offsets.reduce((s, o) => s + o.lng, 0) / offsets.length;
  const avgOffsetLat = offsets.reduce((s, o) => s + o.lat, 0) / offsets.length;
  const avgDist = Math.sqrt(avgOffsetLng ** 2 + avgOffsetLat ** 2) * 111320;

  addTextLog(`[调试] 坐标偏移量: lng+${avgOffsetLng.toFixed(5)} lat${avgOffsetLat.toFixed(5)} (~${avgDist.toFixed(0)}m)`, 'warn');

  // 2. 找附近采样点
  const ref = CALIBRATION_SAMPLES[0];
  const nearbyPoints = allPoints.filter((p) => {
    const [lng, lat] = p.location?.coordinates || [0, 0];
    return Math.abs(lng - ref.db_lng) < 0.05 && Math.abs(lat - ref.db_lat) < 0.05;
  }).slice(0, 30);

  if (nearbyPoints.length === 0) {
    addTextLog('[调试] 未找到附近采样点', 'info');
    return;
  }

  // 3. 构建对比数据并渲染
  const dbPoints = nearbyPoints.map((p) => {
    const [lng, lat] = p.location.coordinates;
    return { point_id: p.point_id, lng, lat };
  });
  const calibratedPoints = dbPoints.map((p) => ({
    point_id: p.point_id,
    lng: p.lng + avgOffsetLng,
    lat: p.lat + avgOffsetLat,
  }));

  renderDebugCalibration(dbPoints, calibratedPoints, COLORS);
  addTextLog(`[调试] 显示 ${nearbyPoints.length} 个对比点: 🔴DB原始 🟢校准后 🟡偏移线`, 'info');
}
