/**
 * 瓦片渲染层
 *
 * 从 map.js 提取的 MapLibre 矢量瓦片图层定义。
 * 负责水系、建筑、车道、标注等瓦片图层的渲染。
 * 不包含交互逻辑（悬停/点击）—— 交互层独立。
 *
 * 可通过 enable/disable 开关。
 */

import { getMap } from './map.js';

const LAYER_IDS = [
  'road-motorway-case', 'road-motorway', 'road-primary',
  'road-secondary', 'road-minor',
  'road-footway', 'road-pedestrian', 'road-platform', 'road-cycleway', 'road-path-other',
  'road-steps', 'road-transit',
  'road-label', 'poi-label', 'place-label',
  'background', 'water', 'landuse', 'building', 'building-outline',
];

let enabled = true;

export function initTileRenderer() {
  // 瓦片图层在 map.js initMap 时已创建（getDefaultLayers），默认可见
  enabled = true;
}

export function enableTileRenderer() {
  const map = getMap();
  if (!map) return;
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  }
  enabled = true;
}

export function disableTileRenderer() {
  const map = getMap();
  if (!map) return;
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  }
  enabled = false;
}

export function toggleTileRenderer() {
  if (enabled) disableTileRenderer();
  else enableTileRenderer();
  return enabled;
}

export function isTileRendererEnabled() {
  return enabled;
}

/**
 * 生成瓦片图层定义（供 map.js initMap 时使用）
 */
export function getTileLayers() {
  const w = (min, max) => ['interpolate', ['linear'], ['zoom'], 10, min, 15, max];

  return [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f9fa' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
      paint: { 'fill-color': '#c8e7f5', 'fill-opacity': 0.8 } },
    { id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
      paint: { 'fill-color': '#e9f5e9', 'fill-opacity': 0.6 } },
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
      paint: { 'fill-color': '#e9ecef', 'fill-opacity': 0.85 } },
    { id: 'building-outline', type: 'line', source: 'openmaptiles', 'source-layer': 'building',
      paint: { 'line-color': '#ced4da', 'line-width': 0.8 } },

    // 车道
    { id: 'road-motorway-case', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'motorway', 'trunk'],
      paint: { 'line-color': '#546e7a', 'line-width': w(5, 16) } },
    { id: 'road-motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'motorway', 'trunk'],
      paint: { 'line-color': '#78909c', 'line-width': w(3, 12) } },
    { id: 'road-primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['==', 'class', 'primary'],
      paint: { 'line-color': '#90a4ae', 'line-width': w(2.5, 10) } },
    { id: 'road-secondary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'secondary', 'tertiary'],
      paint: { 'line-color': '#b0bec5', 'line-width': w(2, 7) } },
    { id: 'road-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', 'class', 'minor', 'service'],
      paint: { 'line-color': '#cfd8dc', 'line-width': w(1.5, 5) } },

    // 人行道
    { id: 'road-footway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['==', 'subclass', 'footway']],
      paint: { 'line-color': '#2196f3', 'line-width': w(1.5, 5) } },
    { id: 'road-pedestrian', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['==', 'subclass', 'pedestrian']],
      paint: { 'line-color': '#1565c0', 'line-width': w(2, 6) } },
    { id: 'road-platform', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['==', 'subclass', 'platform']],
      paint: { 'line-color': '#5c6bc0', 'line-width': w(1.5, 4) } },
    { id: 'road-cycleway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['==', 'subclass', 'cycleway']],
      paint: { 'line-color': '#7e57c2', 'line-width': w(1, 3), 'line-dasharray': [4, 2] } },
    { id: 'road-path-other', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['!in', 'subclass', 'footway', 'pedestrian', 'platform', 'cycleway', 'steps']],
      paint: { 'line-color': '#42a5f5', 'line-width': w(1, 4) } },

    // 台阶
    { id: 'road-steps', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['all', ['==', 'class', 'path'], ['==', 'subclass', 'steps']],
      paint: { 'line-color': '#e53935', 'line-width': w(2, 5), 'line-dasharray': [6, 3] } },

    // 公共交通
    { id: 'road-transit', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['==', 'class', 'transit'],
      paint: { 'line-color': '#7c4dff', 'line-width': w(2, 5) } },

    // 标注
    { id: 'road-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name',
      minzoom: 12,
      layout: { 'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name']], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 15], 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'line', 'text-letter-spacing': 0.05 },
      paint: { 'text-color': '#212529', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    { id: 'poi-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi',
      minzoom: 13,
      layout: { 'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name']], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 15, 14], 'text-font': ['Noto Sans Regular'], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.5 },
      paint: { 'text-color': '#343a40', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    { id: 'place-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
      layout: { 'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name']], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 18], 'text-font': ['Noto Sans Regular'], 'text-variable-anchor': ['center'] },
      paint: { 'text-color': '#212529', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
  ];
}
