"""
将广州市 pedestrian way 导入 MongoDB（osm_ways 集合）

只存 OSM 原始标签 + 几何数据，不存任何视障标签。
这是一个只读镜像，用于空间查询（2dsphere 索引）。

用法：
  python import_osm_ways.py                # 导入
  python import_osm_ways.py --drop         # 先清空再导入
"""

import argparse
import os
import sys
import time
import osmium
from pymongo import MongoClient, GEOSPHERE

# 与 osm_lookup.py 一致的 pedestrian highway 类型
PEDESTRIAN_HIGHWAYS = {
    'footway', 'sidewalk', 'crossing', 'steps', 'path',
    'pedestrian', 'living_street', 'residential',
}


class WayHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.node_coords = {}
        self.ways = []

    def node(self, n):
        self.node_coords[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        tags = dict(w.tags)
        hw = tags.get('highway', '')

        # 保留 pedestrian 类型 + 有特殊设施的 way
        if hw in PEDESTRIAN_HIGHWAYS or tags.get('bridge') == 'yes' or tags.get('tunnel') == 'yes':
            coords = []
            for nd in w.nodes:
                c = self.node_coords.get(nd.ref)
                if c:
                    coords.append(list(c))
            if len(coords) >= 2:
                self.ways.append({
                    'osm_id': w.id,
                    'osm_type': 'way',
                    'tags': tags,
                    'coords': coords,
                })


def main():
    parser = argparse.ArgumentParser(description='Import OSM pedestrian ways to MongoDB')
    parser.add_argument('--osm-file', default=None, help='OSM file path')
    parser.add_argument('--mongodb-uri', default='mongodb://localhost:27017/blind_map')
    parser.add_argument('--drop', action='store_true', help='Drop collection before import')
    args = parser.parse_args()

    osm_file = args.osm_file or os.path.join(
        os.path.dirname(__file__), '..', '..', '..', 'osm_data', 'guangzhou.osm'
    )
    osm_file = os.path.abspath(osm_file)

    print(f'=== OSM Way Import ===')
    print(f'OSM file: {osm_file}')
    print(f'MongoDB: {args.mongodb_uri}')
    print()

    # 1. 扫描 OSM 文件
    t0 = time.time()
    print(f'[1/4] Scanning OSM file...')
    handler = WayHandler()
    handler.apply_file(osm_file)
    elapsed = time.time() - t0
    print(f'  Nodes: {len(handler.node_coords)}')
    print(f'  Pedestrian ways: {len(handler.ways)}')
    print(f'  Time: {elapsed:.1f}s')

    # 2. 构建 GeoJSON 文档
    print(f'[2/4] Building documents...')
    docs = []
    for w in handler.ways:
        # 过滤无效几何：去重相邻相同坐标
        coords = w['coords']
        deduped = [coords[0]]
        for c in coords[1:]:
            if c != deduped[-1]:
                deduped.append(c)

        if len(deduped) < 2:
            continue  # MongoDB 2dsphere 要求 LineString 至少 2 个不同顶点

        geometry = {
            'type': 'LineString',
            'coordinates': deduped,
        }
        docs.append({
            'osm_id': w['osm_id'],
            'osm_type': w['osm_type'],
            'tags': w['tags'],
            'geometry': geometry,
            'highway': w['tags'].get('highway', ''),
        })
    print(f'  Documents: {len(docs)}')

    # 3. 写入 MongoDB
    print(f'[3/4] Writing to MongoDB...')
    client = MongoClient(args.mongodb_uri)
    db = client.get_default_database()
    col = db['osm_ways']

    if args.drop:
        col.drop()
        print(f'  Dropped existing osm_ways collection')

    # 批量写入（每批 1000 条）
    batch_size = 1000
    inserted = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        try:
            col.insert_many(batch, ordered=False)
        except Exception as e:
            # 忽略重复 key 错误
            if 'duplicate key' not in str(e):
                print(f'  Warning: {e}')
        inserted += len(batch)
        if inserted % 5000 == 0:
            print(f'  ... {inserted}/{len(docs)}')

    print(f'  Inserted: {inserted}')

    # 4. 创建索引
    print(f'[4/4] Creating indexes...')
    col.create_index([('geometry', GEOSPHERE)])
    col.create_index([('highway', 1)])
    col.create_index([('osm_id', 1)], unique=True)
    print(f'  2dsphere index on geometry')
    print(f'  Index on highway')
    print(f'  Unique index on osm_id')

    elapsed = time.time() - t0
    print(f'\n=== Done: {len(docs)} ways in {elapsed:.1f}s ===')

    client.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
