/**
 * 道路主题配置
 *
 * class + subclass 全量映射，新增类型加一行即可。
 * getRoadStyle(props) 自动匹配：class/subclass > class > default
 */

const ROAD_CLASSES = {
  // ── 车道（灰色系）──────────────────
  'motorway':        { color: '#78909c', width: 5,   label: '高速路',   group: 'car',     order: 1 },
  'trunk':           { color: '#78909c', width: 4.5, label: '快速路',   group: 'car',     order: 2 },
  'primary':         { color: '#90a4ae', width: 3.5, label: '主干道',   group: 'car',     order: 3 },
  'secondary':       { color: '#90a4ae', width: 3,   label: '次干道',   group: 'car',     order: 4 },
  'tertiary':        { color: '#b0bec5', width: 2.5, label: '支路',     group: 'car',     order: 5 },
  'minor':           { color: '#b0bec5', width: 2,   label: '小路',     group: 'car',     order: 6 },
  'service':         { color: '#cfd8dc', width: 1.8, label: '服务路',   group: 'car',     order: 7 },

  // ── 人行道（蓝色系）─────────────────
  'path/footway':    { color: '#2196f3', width: 3,   label: '人行道',   group: 'walk',    order: 20 },
  'path/pedestrian': { color: '#1565c0', width: 3.5, label: '步行街',   group: 'walk',    order: 21 },
  'path/platform':   { color: '#5c6bc0', width: 2.5, label: '站台',     group: 'walk',    order: 17 },
  'path/cycleway':   { color: '#7e57c2', width: 2,   label: '自行车道', group: 'bike',    order: 18 },
  'path/path':       { color: '#42a5f5', width: 2,   label: '小径',     group: 'walk',    order: 19 },
  'path':            { color: '#42a5f5', width: 2.5, label: '步道',     group: 'walk',    order: 18 },

  // ── 台阶（红色，高危）───────────────
  'path/steps':      { color: '#e53935', width: 3,   label: '台阶',     group: 'danger',  order: 30 },

  // ── 公共交通（紫色）─────────────────
  'transit/subway':  { color: '#7c4dff', width: 3,   label: '地铁',     group: 'transit', order: 25 },
  'transit':         { color: '#9575cd', width: 2.5, label: '公交',     group: 'transit', order: 24 },

  // ── 默认 ───────────────────────────
  '_default':        { color: '#bdbdbd', width: 1.5, label: '道路',     group: 'other',   order: 0 },
};

const ROAD_GROUPS = {
  car:     { label: '车道',     color: '#90a4ae' },
  walk:    { label: '人行道',   color: '#2196f3' },
  bike:    { label: '自行车道', color: '#7e57c2' },
  danger:  { label: '台阶',     color: '#e53935' },
  transit: { label: '公共交通', color: '#7c4dff' },
  other:   { label: '其他',     color: '#bdbdbd' },
};

/**
 * 根据瓦片属性获取样式
 */
export function getRoadStyle(props) {
  const cls = props.class || '';
  const sub = props.subclass || '';
  if (sub && ROAD_CLASSES[cls + '/' + sub]) return ROAD_CLASSES[cls + '/' + sub];
  if (ROAD_CLASSES[cls]) return ROAD_CLASSES[cls];
  return ROAD_CLASSES['_default'];
}

export function getRoadLabel(props) {
  return getRoadStyle(props).label;
}

export function getLegendItems() {
  return Object.entries(ROAD_GROUPS).map(([group, v]) => ({ group, ...v }));
}

export { ROAD_CLASSES, ROAD_GROUPS };
