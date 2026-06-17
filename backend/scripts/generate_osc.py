"""
OSM 补丁生成脚本

职责：
1. 从 MongoDB 读取 pending 的 semantic_tags
2. 用 osmium 解析 workspace.osm，提取 pedestrian 相关的 way/node
3. 用 shapely 做空间匹配，找到每个采样点最近的 OSM 元素
4. 生成 changes.osc 文件（XML 格式，<modify> 元素）
5. 将匹配结果写回 MongoDB（matched_osm_id, matched_osm_type, match_distance_m）

用法：
    python generate_osc.py \
        --mongodb-uri mongodb://localhost:27017/blind_map \
        --osm-file /path/to/workspace.osm \
        --output /path/to/changes.osc \
        --point-ids P_xxx,P_yyy

依赖：
    pip install shapely pymongo osmium
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring

import osmium
from pymongo import MongoClient
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points
from shapely.strtree import STRtree


# ============================================================
# 1. osmium Handler：提取 pedestrian 相关的 way 和 node
# ============================================================

class PedestrianWayHandler(osmium.SimpleHandler):
    """
    扫描 OSM 文件，收集所有与行人相关的 way 及其节点坐标。
    仅保留 highway=footway/sidewalk/crossing/steps/path/pedestrian 等。
    """

    PEDESTRIAN_HIGHWAYS = {
        'footway', 'sidewalk', 'crossing', 'steps', 'path',
        'pedestrian', 'living_street', 'residential',
    }

    def __init__(self):
        super().__init__()
        self.node_coords = {}  # node_id → (lon, lat)
        self.ways = []         # [{id, node_ids, tags}]

    def node(self, n):
        self.node_coords[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        tags = dict(w.tags)
        highway = tags.get('highway', '')
        if highway in self.PEDESTRIAN_HIGHWAYS:
            node_ids = [nd.ref for nd in w.nodes]
            self.ways.append({
                'id': w.id,
                'version': w.version,
                'node_ids': node_ids,
                'tags': tags,
            })


def build_spatial_index(handler):
    """
    构建 shapely 空间索引。
    返回：(strtree, geometries, way_meta)
    - strtree: STRtree 空间索引
    - geometries: 与 strtree 对应的 LineString 列表
    - way_meta: 与 geometries 对应的 way 元数据
    """
    geometries = []
    way_meta = []

    for way in handler.ways:
        coords = []
        for nid in way['node_ids']:
            if nid in handler.node_coords:
                coords.append(handler.node_coords[nid])

        if len(coords) >= 2:
            try:
                line = LineString(coords)
                if line.is_valid and line.length > 0:
                    geometries.append(line)
                    way_meta.append({
                        'id': way['id'],
                        'version': way['version'],
                        'tags': way['tags'],
                        'coords': coords,
                    })
            except Exception:
                continue

    if not geometries:
        return None, [], []

    strtree = STRtree(geometries)
    return strtree, geometries, way_meta


# ============================================================
# 2. 空间匹配：为每个采样点找到最近的 way
# ============================================================

def find_nearest_way(strtree, geometries, way_meta, lon, lat):
    """
    找到距离 (lon, lat) 最近的 way。
    返回：(way_info, distance_m) 或 (None, None)
    """
    if strtree is None:
        return None, None

    point = Point(lon, lat)
    idx = strtree.nearest(point)
    nearest_line = geometries[idx]
    way_info = way_meta[idx]

    # 计算距离（度 → 近似米）
    nearest_pt = nearest_points(point, nearest_line)[1]
    distance_deg = point.distance(nearest_pt)
    distance_m = distance_deg * 111320  # 经纬度近似换算

    return way_info, distance_m


# ============================================================
# 3. OSC 生成
# ============================================================

def generate_osc(modifications, output_path):
    """
    生成 OSM Change (.osc) 文件。

    modifications: [{
        'osm_id': int,
        'osm_type': 'way' | 'node',
        'version': int,
        'new_tags': {k: v, ...}
    }]
    """
    from xml.dom.minidom import parseString

    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<osmChange version="0.6">')

    for mod in modifications:
        osm_type = mod['osm_type']
        osm_id = str(mod['osm_id'])
        version = str(mod['version'])

        lines.append(f'  <modify>')
        lines.append(f'    <{osm_type} id="{osm_id}" version="{version}">')
        for k, v in sorted(mod['new_tags'].items()):
            # XML 转义
            v_escaped = str(v).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
            k_escaped = str(k).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
            lines.append(f'      <tag k="{k_escaped}" v="{v_escaped}"/>')
        lines.append(f'    </{osm_type}>')
        lines.append(f'  </modify>')

    lines.append('</osmChange>')

    content = '\n'.join(lines) + '\n'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    return output_path


# ============================================================
# 4. 主流程
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description='Generate OSM change file from CorSight semantic tags'
    )
    parser.add_argument('--mongodb-uri', required=True, help='MongoDB connection URI')
    parser.add_argument('--osm-file', required=True, help='Path to workspace.osm')
    parser.add_argument('--output', required=True, help='Output .osc file path')
    parser.add_argument('--point-ids', default='',
                        help='Comma-separated point_ids (empty = all pending)')
    parser.add_argument('--max-distance', type=float, default=50.0,
                        help='Max match distance in meters (default: 50)')
    return parser.parse_args()


def main():
    args = parse_args()
    t0 = time.time()

    # 解析 point_ids
    point_ids = []
    if args.point_ids:
        point_ids = [p.strip() for p in args.point_ids.split(',') if p.strip()]

    # ── Step 1: 连接 MongoDB，获取 pending 标签 ────
    sys.stderr.write(f'[generate_osc] Connecting to MongoDB...\n')
    client = MongoClient(args.mongodb_uri)
    db = client.get_default_database()
    tags_col = db['semantic_tags']

    query = {'status': 'pending'}
    if point_ids:
        query['point_id'] = {'$in': point_ids}

    pending_tags = list(tags_col.find(query))
    sys.stderr.write(f'[generate_osc] Found {len(pending_tags)} pending tags\n')

    if not pending_tags:
        result = {
            'status': 'no_pending',
            'matched': 0,
            'unmatched': 0,
            'errors': [],
            'output_file': args.output,
            'elapsed_s': round(time.time() - t0, 2),
        }
        # 生成空 OSC
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write('<osmChange version="0.6"/>\n')
        print(json.dumps(result))
        client.close()
        return 0

    # ── Step 2: 用 osmium 扫描 OSM 文件 ───────────
    sys.stderr.write(f'[generate_osc] Scanning OSM file: {args.osm_file}\n')
    handler = PedestrianWayHandler()
    handler.apply_file(args.osm_file)
    sys.stderr.write(
        f'[generate_osc] Scanned: {len(handler.node_coords)} nodes, '
        f'{len(handler.ways)} pedestrian ways\n'
    )

    # ── Step 3: 构建空间索引 ──────────────────────
    sys.stderr.write(f'[generate_osc] Building spatial index...\n')
    strtree, geometries, way_meta = build_spatial_index(handler)
    sys.stderr.write(f'[generate_osc] Index built: {len(geometries)} ways\n')

    # ── Step 4: 匹配 + 生成 OSC ───────────────────
    modifications = []
    matched_count = 0
    unmatched_count = 0
    errors = []

    for tag_doc in pending_tags:
        point_id = tag_doc['point_id']
        coords = tag_doc.get('location', {}).get('coordinates', [])
        tags = tag_doc.get('tags', {})

        if len(coords) < 2:
            errors.append(f'{point_id}: invalid coordinates')
            unmatched_count += 1
            continue

        lon, lat = coords[0], coords[1]

        # 跳过空标签
        if not tags:
            errors.append(f'{point_id}: empty tags, skipped')
            unmatched_count += 1
            continue

        way_info, distance_m = find_nearest_way(strtree, geometries, way_meta, lon, lat)

        if way_info is None:
            errors.append(f'{point_id}: no nearby way found')
            unmatched_count += 1
            continue

        if distance_m > args.max_distance:
            errors.append(f'{point_id}: nearest way is {distance_m:.1f}m away (max: {args.max_distance}m)')
            unmatched_count += 1
            continue

        # 构建要注入的标签（只注入非空值）
        new_tags = dict(way_info['tags'])  # 保留原标签
        for k, v in tags.items():
            if v is not None and v != '' and v != 'unknown':
                new_tags[str(k)] = str(v)

        modifications.append({
            'osm_id': way_info['id'],
            'osm_type': 'way',
            'version': way_info['version'],
            'new_tags': new_tags,
        })

        # 回写 MongoDB 匹配结果
        try:
            tags_col.update_one(
                {'_id': tag_doc['_id']},
                {'$set': {
                    'matched_osm_id': way_info['id'],
                    'matched_osm_type': 'way',
                    'match_distance_m': round(distance_m, 2),
                    'updated_at': datetime.utcnow(),
                }}
            )
        except Exception as e:
            errors.append(f'{point_id}: MongoDB update failed: {e}')

        matched_count += 1

    # ── Step 5: 生成 OSC 文件 ─────────────────────
    if modifications:
        generate_osc(modifications, args.output)
        sys.stderr.write(f'[generate_osc] OSC generated: {len(modifications)} modifications\n')
    else:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
            f.write('<osmChange version="0.6"/>\n')
        sys.stderr.write(f'[generate_osc] No modifications to make\n')

    # ── Step 6: 输出结果 JSON ─────────────────────
    result = {
        'status': 'ok' if modifications else 'no_changes',
        'matched': matched_count,
        'unmatched': unmatched_count,
        'modifications': len(modifications),
        'errors': errors,
        'output_file': args.output,
        'elapsed_s': round(time.time() - t0, 2),
    }
    print(json.dumps(result))

    sys.stderr.write(
        f'[generate_osc] Done: {matched_count} matched, '
        f'{unmatched_count} unmatched, {len(errors)} errors, '
        f'{result["elapsed_s"]}s\n'
    )

    client.close()
    return 0 if not errors else 0  # errors 是非致命的


if __name__ == '__main__':
    sys.exit(main())
