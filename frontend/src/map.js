/**
 * 地图模块（MapLibre GL）
 *
 * 负责：底图加载、采样点标注、扇形绘制、路线绘制
 */

let map = null;

/** 已选中的路线起点/终点 */
let routeOrigin = null;
let routeDest = null;

/** 回调 */
let onPointClick = null;
let onMapClick = null;

/**
 * 初始化地图
 */
export function initMap(container, opts = {}) {
  onPointClick = opts.onPointClick || (() => {});
  onMapClick = opts.onMapClick || (() => {});

  map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [113.33, 23.14], // 广州
    zoom: 14,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    // 路线图层
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route',
      paint: { 'line-color': '#00d2ff', 'line-width': 4, 'line-opacity': 0.8 },
    });

    // 扇形蒙版图层
    map.addSource('sectors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'sector-fill', type: 'fill', source: 'sectors',
      paint: { 'fill-color': '#0088ff', 'fill-opacity': 0.2 },
    });
    map.addLayer({
      id: 'sector-outline', type: 'line', source: 'sectors',
      paint: { 'line-color': '#0088ff', 'line-width': 1, 'line-opacity': 0.5 },
    });

    // 采样点图层
    map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'points-circle', type: 'circle', source: 'points',
      paint: {
        'circle-radius': 6,
        'circle-color': [
          'case',
          ['==', ['get', 'hasVlm'], true], '#00d2ff',
          ['==', ['get', 'hasOsm'], true], '#3fb950',
          '#8899aa',
        ],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
      },
    });

    // 路线起终点标记
    map.addSource('markers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'markers-symbol', type: 'symbol', source: 'markers',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 14,
        'text-anchor': 'bottom',
        'text-offset': [0, -1],
        'text-font': ['Noto Sans Regular'],
      },
      paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    // 点击事件
    map.on('click', 'points-circle', (e) => {
      const props = e.features[0].properties;
      onPointClick(JSON.parse(props.data));
    });

    map.on('click', (e) => {
      if (!e.defaultPrevented) {
        onMapClick(e.lngLat);
      }
    });

    map.on('mouseenter', 'points-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'points-circle', () => { map.getCanvas().style.cursor = ''; });
  });

  return map;
}

/**
 * 渲染采样点到地图
 */
export function renderPoints(points) {
  if (!map || !map.getSource('points')) return;

  const features = points.map((p) => {
    const coords = p.location?.coordinates || [0, 0];
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        point_id: p.point_id,
        hasVlm: p.images?.some((i) => i.osm_tags && Object.keys(i.osm_tags).length > 0) || false,
        hasOsm: false,
        data: JSON.stringify({
          point_id: p.point_id,
          location: coords,
          images: p.images || [],
          merged_osm_tags: p.merged_osm_tags || {},
          merged_description: p.merged_description || '',
          status: p.status,
        }),
      },
    };
  });

  map.getSource('points').setData({ type: 'FeatureCollection', features });
}

/**
 * 绘制采样点的扇形覆盖
 */
export function renderSectors(pointId, images) {
  if (!map || !map.getSource('sectors')) return;

  const features = [];
  const point = map.getSource('points')?._data?.features?.find(
    (f) => f.properties.point_id === pointId
  );
  if (!point) return;

  const [lng, lat] = point.geometry.coordinates;

  for (const img of (images || [])) {
    const bearing = img.bearing || 0;
    const fov = img.fov || 90;
    const sectorCoords = computeSectorCoords(lng, lat, bearing, fov, 0.0005); // ~50m
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [sectorCoords] },
      properties: { bearing },
    });
  }

  map.getSource('sectors').setData({ type: 'FeatureCollection', features });
}

/**
 * 清除扇形
 */
export function clearSectors() {
  if (map?.getSource('sectors')) {
    map.getSource('sectors').setData({ type: 'FeatureCollection', features: [] });
  }
}

/**
 * 绘制路线
 */
export function renderRoute(coords, origin, dest) {
  if (!map) return;

  // 路线
  if (map.getSource('route')) {
    map.getSource('route').setData({
      type: 'FeatureCollection',
      features: coords.length > 1 ? [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      }] : [],
    });
  }

  // 起终点标记
  const markers = [];
  if (origin) markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] }, properties: { label: '起点' } });
  if (dest) markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [dest.lng, dest.lat] }, properties: { label: '终点' } });
  if (map.getSource('markers')) {
    map.getSource('markers').setData({ type: 'FeatureCollection', features: markers });
  }

  // 适配视野
  if (coords.length > 0) {
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 80 });
  }
}

/**
 * 清除路线
 */
export function clearRoute() {
  if (map?.getSource('route')) map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  if (map?.getSource('markers')) map.getSource('markers').setData({ type: 'FeatureCollection', features: [] });
}

// ── 内部工具 ─────────────────────────────────────

/**
 * 计算扇形坐标（简化版，纯经纬度偏移）
 */
function computeSectorCoords(lng, lat, bearing, fov, radiusDeg) {
  const halfFov = fov / 2;
  const startAngle = bearing - halfFov;
  const steps = 12;
  const angleStep = fov / steps;
  const points = [[lng, lat]];

  for (let i = 0; i <= steps; i++) {
    const angle = ((startAngle + i * angleStep) * Math.PI) / 180;
    const dx = radiusDeg * Math.sin(angle);
    const dy = radiusDeg * Math.cos(angle);
    points.push([lng + dx, lat + dy]);
  }
  points.push([lng, lat]);
  return points;
}

export function getMap() { return map; }
