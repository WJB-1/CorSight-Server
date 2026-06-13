"""
OSM 本地查询脚本

扫描 workspace.osm，在给定多边形/中心点范围内查找行人相关 OSM 元素。
首次调用较慢（加载 3.2GB XML），后续调用 Python 进程会被 osmLookupService 缓存。

用法：
  # 多边形查询（扇区内）
  python osm_lookup.py --osm-file workspace.osm --polygon '[[lng,lat],...]'

  # 最近 way 查询（注入匹配用）
  python osm_lookup.py --osm-file workspace.osm --center "lng,lat" --max-results 5
"""

import argparse
import json
import sys
import time

import osmium
from shapely.geometry import Point, Polygon, LineString
from shapely.strtree import STRtree


PEDESTRIAN_HIGHWAYS = {
    'footway', 'sidewalk', 'crossing', 'steps', 'path',
    'pedestrian', 'living_street', 'residential',
}


class SimpleHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.node_coords = {}
        self.ways = []

    def node(self, n):
        self.node_coords[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        tags = dict(w.tags)
        if tags.get('highway', '') in PEDESTRIAN_HIGHWAYS:
            self.ways.append({
                'id': w.id,
                'node_ids': [nd.ref for nd in w.nodes],
                'tags': tags,
            })


def build_geometries(handler):
    """构建 way 的 LineString 列表和元数据"""
    geometries = []
    meta = []
    for w in handler.ways:
        coords = [handler.node_coords[nid] for nid in w['node_ids'] if nid in handler.node_coords]
        if len(coords) >= 2:
            try:
                line = LineString(coords)
                if line.is_valid:
                    geometries.append(line)
                    meta.append({'osm_id': w['id'], 'osm_type': 'way', 'tags': w['tags']})
            except Exception:
                continue
    return geometries, meta


def query_polygon(polygon_coords, geometries, meta):
    """在多边形内查找 way"""
    poly = Polygon(polygon_coords)
    if not poly.is_valid:
        poly = poly.buffer(0)

    results = []
    for i, line in enumerate(geometries):
        if poly.intersects(line):
            results.append(meta[i])
    return results


def query_nearest(lon, lat, geometries, meta, max_results=5):
    """查找最近的 way"""
    point = Point(lon, lat)
    tree = STRtree(geometries)
    indices = tree.query(point, predicate='dwithin', distance=0.002)  # ~200m

    results = []
    for idx in indices:
        dist = point.distance(geometries[idx]) * 111320  # approx meters
        results.append({**meta[idx], 'distance_m': round(dist, 2)})

    results.sort(key=lambda r: r['distance_m'])
    return results[:max_results]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--osm-file', required=True)
    parser.add_argument('--polygon', default='', help='JSON polygon coordinates')
    parser.add_argument('--center', default='', help='"lng,lat" for nearest query')
    parser.add_argument('--max-results', type=int, default=5)
    args = parser.parse_args()

    t0 = time.time()

    sys.stderr.write(f'[osm_lookup] Scanning {args.osm_file}...\n')
    handler = SimpleHandler()
    handler.apply_file(args.osm_file)

    sys.stderr.write(f'[osm_lookup] Building geometries...\n')
    geometries, meta = build_geometries(handler)
    sys.stderr.write(f'[osm_lookup] {len(geometries)} pedestrian ways loaded ({time.time()-t0:.1f}s)\n')

    if args.polygon:
        # 多边形查询
        polygon_coords = json.loads(args.polygon)
        results = query_polygon(polygon_coords, geometries, meta)
        print(json.dumps({'elements': results, 'count': len(results), 'elapsed_s': round(time.time()-t0, 2)}))
    elif args.center:
        # 最近 way 查询
        parts = args.center.split(',')
        lon, lat = float(parts[0]), float(parts[1])
        results = query_nearest(lon, lat, geometries, meta, args.max_results)
        print(json.dumps({'elements': results, 'count': len(results), 'elapsed_s': round(time.time()-t0, 2)}))
    else:
        print(json.dumps({'error': 'provide --polygon or --center'}))

    return 0


if __name__ == '__main__':
    sys.exit(main())
