"""
OSM 本地查询脚本

在给定 OSM 文件中查找行人相关 OSM 元素。

用法：
  # 多边形查询（扇区内）
  python osm_lookup.py --osm-file guangzhou.osm --polygon '[[lng,lat],...]'

  # 最近 way 查询（注入匹配用）
  python osm_lookup.py --osm-file guangzhou.osm --center "lng,lat" --max-results 5

  # 批量查询（路线 RAG 用，多个采样点一次查完）
  python osm_lookup.py --osm-file route_extract.osm --batch-query '[{"lng":113.3,"lat":23.1,"radius":50},...]'
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
    indices = tree.query(point, predicate='dwithin', distance=0.002)

    results = []
    for idx in indices:
        dist = point.distance(geometries[idx]) * 111320
        results.append({**meta[idx], 'distance_m': round(dist, 2)})

    results.sort(key=lambda r: r['distance_m'])
    return results[:max_results]


def query_batch(queries, geometries, meta):
    """批量查询：多个采样点各查一次，用 STRtree 加速"""
    tree = STRtree(geometries)
    results = {}

    for q in queries:
        lng = q['lng']
        lat = q['lat']
        radius_m = q.get('radius', 50)
        # 转换为度
        delta = radius_m / 111320

        point = Point(lng, lat)
        indices = tree.query(point, predicate='dwithin', distance=delta)

        elems = []
        for idx in indices:
            elems.append(meta[idx])

        key = f'{lng:.6f},{lat:.6f}'
        results[key] = elems

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--osm-file', required=True)
    parser.add_argument('--polygon', default='', help='JSON polygon coordinates')
    parser.add_argument('--center', default='', help='"lng,lat" for nearest query')
    parser.add_argument('--batch-query', default='', help='JSON array of {lng,lat,radius}')
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
        polygon_coords = json.loads(args.polygon)
        results = query_polygon(polygon_coords, geometries, meta)
        print(json.dumps({'elements': results, 'count': len(results), 'elapsed_s': round(time.time()-t0, 2)}))
    elif args.center:
        parts = args.center.split(',')
        lon, lat = float(parts[0]), float(parts[1])
        results = query_nearest(lon, lat, geometries, meta, args.max_results)
        print(json.dumps({'elements': results, 'count': len(results), 'elapsed_s': round(time.time()-t0, 2)}))
    elif args.batch_query:
        queries = json.loads(args.batch_query)
        results = query_batch(queries, geometries, meta)
        print(json.dumps({'results': results, 'count': len(results), 'elapsed_s': round(time.time()-t0, 2)}))
    else:
        print(json.dumps({'error': 'provide --polygon, --center, or --batch-query'}))

    return 0


if __name__ == '__main__':
    sys.exit(main())
