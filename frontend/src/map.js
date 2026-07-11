/**
 * 地图模块（MapLibre GL + 高德底图）
 *
 * 支持标准地图 / 卫星图切换，一次只显示一种底图。
 * 业务图层：GeoJSON（采样点、路线、扇形、标记），坐标从 WGS-84 转为 GCJ-02 叠加。
 */

import { wgs84ToGcj02 } from './coordTransform.js';
import { api } from './api.js';

let map = null;
let pendingPoints = null;
let onPointClick = null;
let onMapClick = null;
let currentStyle = 'standard'; // 'standard' | 'satellite'

// ── 初始化 ───────────────────────────────────────

export function initMap(container, opts = {}) {
  onPointClick = opts.onPointClick || (() => {});
  onMapClick = opts.onMapClick || (() => {});

  const origin = window.location.origin;

  const style = {
    version: 8,
    sources: {
      // 标准地图（默认）
      'amap-standard': {
        type: 'raster',
        tiles: [`${origin}/api/amap-tiles/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 18,
        attribution: '© 高德地图',
      },
      // 卫星图
      'amap-satellite': {
        type: 'raster',
        tiles: [`${origin}/api/amap-satellite/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 18,
        attribution: '© 高德地图',
      },
      // 路况半透明叠加（默认隐藏，高德仅支持到 z=18，禁止过度放大）
      'amap-traffic': {
        type: 'raster',
        tiles: [`${origin}/api/amap-traffic/{z}/{x}/{y}.png`],
        tileSize: 256,
        minzoom: 10,
        maxzoom: 18,
        maxoverzoom: 1,
      },
    },
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f8f9fa' } },
      { id: 'amap-base', type: 'raster', source: 'amap-standard', paint: { 'raster-opacity': 1 } },
      { id: 'amap-traffic-layer', type: 'raster', source: 'amap-traffic', minzoom: 10, maxzoom: 18, paint: { 'raster-opacity': 1 }, layout: { visibility: 'none' } },
    ],
  };

  // 英德市九龙镇金造村（GCJ-02），直接使用无需转换
  map = new maplibregl.Map({ container, style, center: [112.961714, 24.107455], zoom: 16, maxZoom: 18 });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    // ── 高亮图层（悬停用） ───────────────────────
    map.addSource('road-highlight', { type: 'geojson', data: emptyFC() });
    map.addLayer({
      id: 'road-highlight',
      type: 'line',
      source: 'road-highlight',
      paint: { 'line-color': '#f39c12', 'line-width': 8, 'line-opacity': 0.8 },
    });

    // ── 业务图层 ───────────────────────────────
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

    // ── 事件 ───────────────────────────────────
    let pointClickJustFired = false;
    map.on('click', 'points-circle', (e) => {
      pointClickJustFired = true;
      onPointClick(JSON.parse(e.features[0].properties.data));
      setTimeout(() => { pointClickJustFired = false; }, 0);
    });

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

// ── 图层切换 ─────────────────────────────────────

/**
 * 切换底图：'standard' | 'satellite'
 *
 * 通过控制两个 raster 图层的可见性实现切换。
 * 初始化时只创建了 'amap-base'（standard），首次切卫星时创建 satellite 图层。
 */
let satelliteLayerCreated = false;

export function switchBaseMap(styleName) {
  if (!map) return currentStyle;

  if (styleName === 'satellite' && !satelliteLayerCreated) {
    // 首次切卫星：创建 satellite 图层并隐藏 standard
    map.addLayer(
      { id: 'amap-satellite-layer', type: 'raster', source: 'amap-satellite', paint: { 'raster-opacity': 1 } },
      'amap-base' // 插入到 amap-base 之前（即更底层）
    );
    satelliteLayerCreated = true;
  }

  if (styleName === 'satellite') {
    map.setLayoutProperty('amap-base', 'visibility', 'none');
    map.setLayoutProperty('amap-satellite-layer', 'visibility', 'visible');
    map.setPaintProperty('background', 'background-color', '#000');
  } else {
    map.setLayoutProperty('amap-base', 'visibility', 'visible');
    if (satelliteLayerCreated) {
      map.setLayoutProperty('amap-satellite-layer', 'visibility', 'none');
    }
    map.setPaintProperty('background', 'background-color', '#f8f9fa');
  }

  currentStyle = styleName;

  // 同步按钮 UI
  const btn = document.getElementById('btn-layer-switch');
  if (btn) {
    btn.textContent = styleName === 'satellite' ? '🗺️ 地图' : '🛰️ 卫星';
    btn.classList.toggle('active', styleName === 'satellite');
  }

  return currentStyle;
}

export function getCurrentStyle() {
  return currentStyle;
}

// ── 路况 ─────────────────────────────────────────

let trafficVisible = false;

export function toggleTraffic() {
  if (!map) return false;
  trafficVisible = !trafficVisible;
  const vis = trafficVisible ? 'visible' : 'none';
  map.setLayoutProperty('amap-traffic-layer', 'visibility', vis);

  const btn = document.getElementById('btn-traffic');
  if (btn) {
    btn.textContent = trafficVisible ? '🚦 路况 ✓' : '🚦 路况';
    btn.classList.toggle('active', trafficVisible);
  }
  return trafficVisible;
}

// ── 采样点 ───────────────────────────────────────

export function renderPoints(points) {
  if (!map || !map.getSource('points')) { pendingPoints = points; return; }
  const features = points.map((p) => {
    const coords = p.location?.coordinates || [0, 0];
    const gcjCoords = toGcj02(coords[0], coords[1]);
    return {
      type: 'Feature', geometry: { type: 'Point', coordinates: gcjCoords },
      properties: {
        point_id: p.point_id,
        hasVlm: p.images?.some((i) => i.osm_tags && Object.keys(i.osm_tags).length > 0) || false,
        hasOsm: false,
        data: JSON.stringify({
          point_id: p.point_id, location: coords,
          images: p.images || [], merged_osm_tags: p.merged_osm_tags || {},
          merged_description: p.merged_description || '', status: p.status,
        }),
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

  const gcjCoords = coords.map((c) => toGcj02(c[0], c[1]));

  if (map.getSource('route')) {
    map.getSource('route').setData(gcjCoords.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: gcjCoords }, properties: {} }] } : emptyFC());
  }
  const markers = [];
  if (origin) {
    const [oLng, oLat] = toGcj02(origin.lng, origin.lat);
    markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [oLng, oLat] }, properties: { label: '起点' } });
  }
  if (dest) {
    const [dLng, dLat] = toGcj02(dest.lng, dest.lat);
    markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [dLng, dLat] }, properties: { label: '终点' } });
  }
  if (map.getSource('markers')) map.getSource('markers').setData({ type: 'FeatureCollection', features: markers });
  if (gcjCoords.length > 0) {
    const bounds = gcjCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(gcjCoords[0], gcjCoords[0]));
    map.fitBounds(bounds, { padding: 80 });
  }
}

export function clearRoute() {
  if (map?.getSource('route')) map.getSource('route').setData(emptyFC());
  if (map?.getSource('markers')) map.getSource('markers').setData(emptyFC());
}

// ── 道路高亮 ─────────────────────────────────────

export function highlightFeature(feature) {
  if (!map?.getSource('road-highlight')) return;
  map.getSource('road-highlight').setData({
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  });
}

export function clearHighlight() {
  highlightFeature(null);
}

// ── 调试 ─────────────────────────────────────────

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

function toGcj02(lng, lat) {
  const [glng, glat] = wgs84ToGcj02(lng, lat);
  return [glng, glat];
}

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
