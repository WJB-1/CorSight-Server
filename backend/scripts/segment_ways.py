"""
OSM Way 分段脚本

按拐点将长 way 切分为短段，每段成为独立 way（负数 ID）。
输出新的 OSM 文件，原始 way 保留（标记 segmented=yes）。

用法：
  python segment_ways.py
  python segment_ways.py --apply   # 实际执行（否则只预览）
"""

import argparse
import math
import os
import sys
import time

import osmium

# ── 参数 ──────────────────────────────────────────

TURN_THRESHOLD = 25       # 拐点阈值（度）
CLOSE_THRESHOLD_M = 5     # 圆环判定（米）
RING_SEGMENT_M = 100      # 圆环分段长度（米）
MAX_SEGMENT_M = 300       # 开放路段最大段长（米）
MIN_SEGMENT_M = 20        # 最小段长（米，过短合并）

PEDESTRIAN_HIGHWAYS = {
    'footway', 'sidewalk', 'crossing', 'steps', 'path',
    'pedestrian', 'living_street', 'residential',
}

R = 6371000  # 地球半径（米）

# ── 几何工具 ──────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def bearing_diff(b1, b2):
    d = abs(b1 - b2)
    return min(d, 360 - d)


def is_ring(coords):
    if len(coords) < 4:
        return False
    d = haversine(coords[0][1], coords[0][0], coords[-1][1], coords[-1][0])
    return d < CLOSE_THRESHOLD_M


def coord_distance(coords):
    """计算坐标序列总长度（米）"""
    total = 0
    for i in range(1, len(coords)):
        total += haversine(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
    return total

# ── 分段算法 ──────────────────────────────────────

def find_turn_points(coords):
    """找到所有拐点索引（含首尾）"""
    if len(coords) < 3:
        return [0, len(coords) - 1] if len(coords) >= 2 else [0]

    indices = [0]
    for i in range(1, len(coords) - 1):
        b1 = bearing(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
        b2 = bearing(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
        if bearing_diff(b1, b2) >= TURN_THRESHOLD:
            indices.append(i)
    indices.append(len(coords) - 1)
    return indices


def split_by_distance(coords, max_dist):
    """按最大距离细分一段坐标"""
    segments = []
    current = [coords[0]]
    acc = 0
    for i in range(1, len(coords)):
        d = haversine(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
        acc += d
        current.append(coords[i])
        if acc >= max_dist:
            segments.append(current)
            current = [coords[i]]
            acc = 0
    if len(current) > 1:
        segments.append(current)
    return segments


def segment_ring(coords):
    """圆环按等距分段"""
    if coords[0] == coords[-1]:
        coords = coords[:-1]

    segments = []
    current = [coords[0]]
    acc = 0
    for i in range(1, len(coords)):
        d = haversine(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0])
        acc += d
        current.append(coords[i])
        if acc >= RING_SEGMENT_M:
            segments.append(current)
            current = [coords[i]]
            acc = 0

    if len(current) > 1:
        current.append(coords[0])
        segments.append(current)
    elif segments:
        segments[-1].append(coords[0])

    return segments


def segment_open_way(coords, turn_indices):
    """开放路段按拐点分段 + 超长细分"""
    segments = []
    for i in range(len(turn_indices) - 1):
        start = turn_indices[i]
        end = turn_indices[i + 1]
        seg_coords = coords[start:end + 1]

        dist = coord_distance(seg_coords)
        if dist > MAX_SEGMENT_M:
            subs = split_by_distance(seg_coords, MAX_SEGMENT_M)
            segments.extend(subs)
        elif dist < MIN_SEGMENT_M and segments:
            # 太短，合并到前一段（去掉重复的共享节点）
            prev = segments[-1]
            segments[-1] = prev + seg_coords[1:]
        else:
            segments.append(seg_coords)

    return segments


def merge_short_tail(segments):
    """如果最后一段太短，合并到前一段"""
    if len(segments) < 2:
        return segments
    last = segments[-1]
    if coord_distance(last) < MIN_SEGMENT_M:
        prev = segments[-2]
        segments[-2] = prev + last[1:]
        segments.pop()
    return segments


# ── 分段主函数 ────────────────────────────────────

def segment_way(coords):
    """对一条 way 的坐标序列执行分段，返回分段后的坐标列表"""
    if len(coords) < 2:
        return [coords]

    if is_ring(coords):
        return segment_ring(coords)

    turn_indices = find_turn_points(coords)
    segments = segment_open_way(coords, turn_indices)
    segments = merge_short_tail(segments)

    return [s for s in segments if len(s) >= 2]


# ── osmium Handler ────────────────────────────────

class WayInfo:
    def __init__(self, way_id, version, node_ids, tags):
        self.id = way_id
        self.version = version
        self.node_ids = node_ids
        self.tags = tags


class ScanHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.node_coords = {}  # id → (lon, lat)
        self.ways = []         # [WayInfo]

    def node(self, n):
        self.node_coords[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        tags = dict(w.tags)
        if tags.get('highway', '') in PEDESTRIAN_HIGHWAYS:
            node_ids = [nd.ref for nd in w.nodes]
            self.ways.append(WayInfo(w.id, w.version, node_ids, tags))


# ── 输出 OSM XML ─────────────────────────────────

def write_osm_xml(output_path, handler, segmented_ways, original_way_ids):
    """
    写入新的 OSM XML 文件。

    segmented_ways: [{
        'original_id': int,
        'new_id': int,
        'node_ids': [int, ...],
        'tags': {k: v},
    }]
    """
    # 收集所有需要的节点
    needed_nodes = set()
    for sw in segmented_ways:
        for nid in sw['node_ids']:
            needed_nodes.add(nid)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n')
        f.write('<osm version="0.6" generator="segment_ways.py">\n')

        # 写入节点
        for nid in sorted(needed_nodes):
            coord = handler.node_coords.get(nid)
            if coord:
                lon, lat = coord
                f.write(f'  <node id="{nid}" lat="{lat:.7f}" lon="{lon:.7f}"/>\n')

        # 写入原始 way（标记 segmented=yes）
        for way in handler.ways:
            if way.id in original_way_ids:
                f.write(f'  <way id="{way.id}" version="{way.version}">\n')
                for nid in way.node_ids:
                    f.write(f'    <nd ref="{nid}"/>\n')
                for k, v in sorted(way.tags.items()):
                    f.write(f'    <tag k="{k}" v="{xml_escape(v)}"/>\n')
                f.write(f'    <tag k="segmented" v="yes"/>\n')
                f.write('  </way>\n')

        # 写入分段后的新 way
        for sw in segmented_ways:
            f.write(f'  <way id="{sw["new_id"]}" version="1">\n')
            for nid in sw['node_ids']:
                f.write(f'    <nd ref="{nid}"/>\n')
            for k, v in sorted(sw['tags'].items()):
                f.write(f'    <tag k="{k}" v="{xml_escape(v)}"/>\n')
            f.write(f'    <tag k="parent_way" v="{sw["original_id"]}"/>\n')
            f.write('  </way>\n')

        f.write('</osm>\n')


def xml_escape(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


# ── 主流程 ────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Segment OSM pedestrian ways by turn points')
    parser.add_argument('--osm-file', default=None)
    parser.add_argument('--output', default=None)
    parser.add_argument('--apply', action='store_true', help='Execute (otherwise preview only)')
    args = parser.parse_args()

    osm_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'osm_data')
    osm_file = args.osm_file or os.path.join(osm_dir, 'guangzhou.osm')
    output_file = args.output or os.path.join(osm_dir, 'guangzhou_segmented.osm')

    print(f'=== OSM Way Segmentation ===')
    print(f'Input:  {osm_file}')
    print(f'Output: {output_file}')
    print(f'Mode:   {"APPLY" if args.apply else "PREVIEW"}')
    print(f'Params: turn={TURN_THRESHOLD}°, ring={RING_SEGMENT_M}m, max={MAX_SEGMENT_M}m, min={MIN_SEGMENT_M}m')
    print()

    # Step 1: 扫描
    t0 = time.time()
    print(f'[1/4] Scanning OSM file...')
    handler = ScanHandler()
    handler.apply_file(osm_file)
    print(f'  Nodes: {len(handler.node_coords)}')
    print(f'  Pedestrian ways: {len(handler.ways)}')
    print(f'  Time: {time.time()-t0:.1f}s')

    # Step 2: 分段
    print(f'[2/4] Segmenting ways...')
    segmented_ways = []
    original_way_ids = set()
    stats = {'total_original': 0, 'total_segments': 0, 'rings': 0, 'skipped': 0}

    for way in handler.ways:
        stats['total_original'] += 1

        # 获取坐标
        coords = []
        for nid in way.node_ids:
            c = handler.node_coords.get(nid)
            if c:
                coords.append(c)
        if len(coords) < 2:
            stats['skipped'] += 1
            continue

        # 分段
        segments = segment_way(coords)
        original_way_ids.add(way.id)

        if is_ring(coords):
            stats['rings'] += 1

        # 生成新 way
        if len(segments) <= 1:
            # 不需要分段，只有一段
            stats['total_segments'] += 1
            # 不创建新 way（保留原始 way 即可）
            continue

        for seg in segments:
            # 找到分段节点对应的 node ID
            seg_node_ids = find_node_ids_for_segment(handler.node_coords, way.node_ids, seg)
            if not seg_node_ids or len(seg_node_ids) < 2:
                continue

            new_id = 9000000000 + len(segmented_ways) + 1  # 大偏移量，避免与 OSM 官方 ID 冲突
            segmented_ways.append({
                'original_id': way.id,
                'new_id': new_id,
                'node_ids': seg_node_ids,
                'tags': dict(way.tags),
            })
            stats['total_segments'] += 1

    print(f'  Original ways: {stats["total_original"]}')
    print(f'  Rings: {stats["rings"]}')
    print(f'  Skipped (< 2 nodes): {stats["skipped"]}')
    print(f'  Segments created: {stats["total_segments"]}')
    print(f'  New ways: {len(segmented_ways)}')

    # Step 3: 预览
    print(f'\n[3/4] Preview (first 10 segmented ways):')
    for sw in segmented_ways[:10]:
        dist = 0
        for i in range(1, len(sw['node_ids'])):
            c1 = handler.node_coords.get(sw['node_ids'][i-1])
            c2 = handler.node_coords.get(sw['node_ids'][i])
            if c1 and c2:
                dist += haversine(c1[1], c1[0], c2[1], c2[0])
        print(f'  {sw["new_id"]}: parent={sw["original_id"]}, nodes={len(sw["node_ids"])}, dist={dist:.0f}m, tags={sw["tags"].get("highway")}')

    if not args.apply:
        print(f'\n[4/4] SKIPPED (use --apply to execute)')
        print(f'\nWould write {len(segmented_ways)} segmented ways to {output_file}')
        return 0

    # Step 4: 写入
    print(f'\n[4/4] Writing {output_file}...')
    write_osm_xml(output_file, handler, segmented_ways, original_way_ids)
    elapsed = time.time() - t0
    file_size = os.path.getsize(output_file) / (1024 * 1024)
    print(f'  File: {file_size:.1f}MB')
    print(f'  Total time: {elapsed:.1f}s')
    print(f'\n=== Done ===')

    return 0


def find_node_ids_for_segment(node_coords, original_node_ids, seg_coords):
    """
    为分段坐标找到对应的原始 node ID 列表。
    通过坐标精确匹配原始 way 的节点。
    """
    result = []
    coord_to_id = {}
    for nid in original_node_ids:
        c = node_coords.get(nid)
        if c:
            # 用 7 位小数精度匹配
            key = f'{c[0]:.7f},{c[1]:.7f}'
            coord_to_id[key] = nid

    for lon, lat in seg_coords:
        key = f'{lon:.7f},{lat:.7f}'
        nid = coord_to_id.get(key)
        if nid:
            result.append(nid)
        else:
            # 找不到精确匹配，用最近的节点
            min_dist = float('inf')
            best_nid = None
            for orig_nid in original_node_ids:
                c = node_coords.get(orig_nid)
                if c:
                    d = abs(c[0] - lon) + abs(c[1] - lat)
                    if d < min_dist:
                        min_dist = d
                        best_nid = orig_nid
            if best_nid and best_nid not in result:
                result.append(best_nid)

    return result


if __name__ == '__main__':
    sys.exit(main())
