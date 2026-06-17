/**
 * 地图模块（MapLibre GL）
 *
 * 职责：地图初始化 + 业务图层（采样点、路线、扇形、调试）
 * 道路渲染由 tileRenderer.js 和 mongoRoadLayer.js 负责
 * 道路交互由 roadInteraction.js 负责
 */

import { getTileLayers } from './tileRenderer.js';

let map = null;
let pendingPoints = null;

let onPointClick = null;
let onMapClick = null;
let pointClickJustFired = false; // 替代 defaultPrevented，防止同时触发两个点击

// ── 初始化 ───────────────────────────────────────

export function initMap(container, opts = {}) {
  onPointClick = opts.onPointClick || (() => {});
  onMapClick = opts.onMapClick || (() => {});

  const origin = window.location.origin;
  const params = new URLSearchParams(window.location.search);
  const tileSource = params.get('source') || 'segmented';
  const tileUrl = `${origin}/api/tiles/{z}/{x}/{y}.pbf?source=${tileSource}`;

  const style = {
    version: 8,
    sources: {
      openmaptiles: {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 15,
      },
    },
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: getTileLayers(),
  };

  map = new maplibregl.Map({ container, style, center: [113.33, 23.14], zoom: 14, maxZoom: 18 });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    // 业务图层
    addSource('route', { type: 'geojson', data: emptyFC() });
    addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#e63946', 'line-width': 5, 'line-opacity': 0.9 } });

    addSource('sectors', { type: 'geojson', data: emptyFC() });
    addLayer({ id: 'sector-fill', type: 'fill', source: 'sectors', paint: { 'fill-color': '#457b9d', 'fill-opacity': 0.25 } });
    addLayer({ id: 'sector-outline', type: 'line', source: 'sectors', paint: { 'line-color': '#457b9d', 'line-width': 1.5, 'line-opacity': 0.6 } });

    addSource('points', { type: 'geojson', data: emptyFC() });
    addLayer({
      id: 'points-circle', type: 'circle', source: 'points',
      paint: { 'circle-radius': 7, 'circle-color': ['case', ['==', ['get', 'hasVlm'], true], '#e63946', ['==', ['get', 'hasOsm'], true], '#2a9d8f', '#6c757d'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });

    addSource('markers', { type: 'geojson', data: emptyFC() });
    addLayer({
      id: 'markers-symbol', type: 'symbol', source: 'markers',
      layout: { 'text-field': ['get', 'label'], 'text-size': 15, 'text-anchor': 'bottom', 'text-offset': [0, -1.2], 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true },
      paint: { 'text-color': '#e63946', 'text-halo-color': '#fff', 'text-halo-width': 2 },
    });

    // 采样点点击（用标志变量代替 defaultPrevented，MapLibre 某些版本不正确设置该属性）
    map.on('click', 'points-circle', (e) => {
      pointClickJustFired = true;
      onPointClick(JSON.parse(e.features[0].properties.data));
      setTimeout(() => { pointClickJustFired = false; }, 0);
    });

    // 地图点击（路线选点 + 道路查询共用）
    map.on('click', (e) => {
      if (!pointClickJustFired) onMapClick(e.lngLat);
    });

    map.on('mouseenter', 'points-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'points-circle', () => { map.getCanvas().style.cursor = ''; });

    // 补渲染迟到的采样点
    if (pendingPoints) { renderPoints(pendingPoints); pendingPoints = null; }
  });

  return map;
}

// ── 采样点 ───────────────────────────────────────

export function renderPoints(points) {
  if (!map || !map.getSource('points')) { pendingPoints = points; return; }
  const features = points.map((p) => {
    const coords = p.location?.coordinates || [0, 0];
    return {
      type: 'Feature', geometry: { type: 'Point', coordinates: coords },
      properties: {
        point_id: p.point_id,
        hasVlm: p.images?.some((i) => i.osm_tags && Object.keys(i.osm_tags).length > 0) || false,
        hasOsm: false,
        data: JSON.stringify({ point_id: p.point_id, location: coords, images: p.images || [], merged_osm_tags: p.merged_osm_tags || {}, merged_description: p.merged_description || '', status: p.status }),
      },
    };
  });
  map.getSource('points').setData({ type: 'FeatureCollection', features });
}

// ── 扇形 ─────────────────────────────────────────

export function renderSectors(pointId, images) {
  if (!map || !map.getSource('sectors')) return;
  const point = map.getSource('points')?._data?.features?.find((f) => f.properties.point_id === pointId);
  if (!point) return;
  const [lng, lat] = point.geometry.coordinates;
  const features = (images || []).map((img) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [computeSectorCoords(lng, lat, img.bearing || 0, img.fov || 90, 0.0005)] },
    properties: { bearing: img.bearing || 0 },
  }));
  map.getSource('sectors').setData({ type: 'FeatureCollection', features });
}

export function clearSectors() {
  if (map?.getSource('sectors')) map.getSource('sectors').setData(emptyFC());
}

// ── 路线 ─────────────────────────────────────────

export function renderRoute(coords, origin, dest) {
  if (!map) return;
  if (map.getSource('route')) {
    map.getSource('route').setData(coords.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }] } : emptyFC());
  }
  const markers = [];
  if (origin) markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] }, properties: { label: '起点' } });
  if (dest) markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [dest.lng, dest.lat] }, properties: { label: '终点' } });
  if (map.getSource('markers')) map.getSource('markers').setData({ type: 'FeatureCollection', features: markers });
  if (coords.length > 0) {
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 80 });
  }
}

export function clearRoute() {
  if (map?.getSource('route')) map.getSource('route').setData(emptyFC());
  if (map?.getSource('markers')) map.getSource('markers').setData(emptyFC());
}

// ── 调试：坐标校准对比 ───────────────────────────

export function renderDebugCalibration(dbPoints, calibratedPoints, colors = {}) {
  if (!map) return;
  if (!map.getSource('debug-db')) {
    const c = { db: '#e63946', calibrated: '#2a9d8f', line: '#e9c46a', ...colors };
    addSource('debug-db', { type: 'geojson', data: emptyFC() });
    addSource('debug-calibrated', { type: 'geojson', data: emptyFC() });
    addSource('debug-lines', { type: 'geojson', data: emptyFC() });
    addLayer({ id: 'debug-db-circle', type: 'circle', source: 'debug-db', paint: { 'circle-radius': 8, 'circle-color': c.db, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    addLayer({ id: 'debug-db-label', type: 'symbol', source: 'debug-db', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.5], 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': c.db, 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    addLayer({ id: 'debug-cal-circle', type: 'circle', source: 'debug-calibrated', paint: { 'circle-radius': 8, 'circle-color': c.calibrated, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    addLayer({ id: 'debug-cal-label', type: 'symbol', source: 'debug-calibrated', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.5], 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': c.calibrated, 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    addLayer({ id: 'debug-line', type: 'line', source: 'debug-lines', paint: { 'line-color': c.line, 'line-width': 2, 'line-dasharray': [4, 2] } });
  }

  const toFeature = (p, label) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { label } });
  map.getSource('debug-db').setData({ type: 'FeatureCollection', features: dbPoints.map((p) => toFeature(p, `DB:${p.point_id}`)) });
  map.getSource('debug-calibrated').setData({ type: 'FeatureCollection', features: calibratedPoints.map((p) => toFeature(p, `校准:${p.point_id}`)) });

  const lines = [];
  for (const db of dbPoints) {
    const cal = calibratedPoints.find((c) => c.point_id === db.point_id);
    if (cal) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[db.lng, db.lat], [cal.lng, cal.lat]] }, properties: {} });
  }
  map.getSource('debug-lines').setData({ type: 'FeatureCollection', features: lines });
}

export function clearDebugCalibration() {
  for (const id of ['debug-db', 'debug-calibrated', 'debug-lines']) {
    if (map?.getSource(id)) map.getSource(id).setData(emptyFC());
  }
}

// ── 工具 ─────────────────────────────────────────

function addSource(id, def) { map.addSource(id, def); }
function addLayer(def) { map.addLayer(def); }
function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

function computeSectorCoords(lng, lat, bearing, fov, radiusDeg) {
  const halfFov = fov / 2;
  const startAngle = bearing - halfFov;
  const steps = 12;
  const angleStep = fov / steps;
  const points = [[lng, lat]];
  for (let i = 0; i <= steps; i++) {
    const angle = ((startAngle + i * angleStep) * Math.PI) / 180;
    points.push([lng + radiusDeg * Math.sin(angle), lat + radiusDeg * Math.cos(angle)]);
  }
  points.push([lng, lat]);
  return points;
}

export function getMap() { return map; }

/**
 * 销毁地图实例，释放资源
 * 应在页面卸载或组件销毁时调用
 */
export function destroyMap() {
  if (map) {
    map.remove();
    map = null;
    console.log('[Map] Map instance destroyed');
  }
}

// 页面卸载时自动清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', destroyMap);
}
