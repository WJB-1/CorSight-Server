"""
将分段后的 pedestrian way 合并回完整的广州 OSM 数据。

策略：
1. 读取完整广州 OSM，跳过原始 pedestrian way，保留其他所有数据
2. 加入分段后的新 way（负数 ID → 正大数 ID）
3. 输出去重后的 OSM XML
4. osmium sort → PBF

这样 planetiler 生成的瓦片既包含完整道路数据，pedestrian way 又是分段后的。
"""

import os
import sys
import time
import xml.etree.ElementTree as ET

import osmium

PEDESTRIAN_HIGHWAYS = {
    'footway', 'sidewalk', 'crossing', 'steps', 'path',
    'pedestrian', 'living_street', 'residential',
}


class NodeCollector(osmium.SimpleHandler):
    """收集所有 node 坐标"""
    def __init__(self):
        super().__init__()
        self.coords = {}

    def node(self, n):
        self.coords[n.id] = (n.location.lon, n.location.lat)


class WayFilter(osmium.SimpleHandler):
    """读取原始广州数据，跳过 pedestrian way"""
    def __init__(self, skip_ids):
        super().__init__()
        self.skip_ids = skip_ids
        self.node_coords = {}
        self.kept_ways = []
        self.node_ids_needed = set()

    def node(self, n):
        self.node_coords[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        tags = dict(w.tags)
        if w.id in self.skip_ids:
            return  # 只跳过"已被分段替代"的原始 way
        # 保留所有其他 way：车道 + 未被分段的短 pedestrian way
        self.kept_ways.append({
            'id': w.id,
            'version': w.version,
            'node_ids': [nd.ref for nd in w.nodes],
            'tags': tags,
        })
        for nd in w.nodes:
            self.node_ids_needed.add(nd.ref)


def main():
    osm_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'osm_data')
    full_osm = os.path.join(osm_dir, 'guangzhou.osm')
    segmented_osm = os.path.join(osm_dir, 'guangzhou_segmented.osm')
    output_osm = os.path.join(osm_dir, 'guangzhou_merged_v2.osm')
    output_pbf = os.path.join(osm_dir, 'guangzhou_merged_v2.pbf')
    osmium_path = 'D:\\project_file\\CorSight_Navigation\\osmium-tool-1.19.0\\build2\\src\\osmium.exe'

    t0 = time.time()

    # Step 1: 读取分段后的 way，只保留新分段 way（有 parent_way 的）
    # 原始长 way（标记 segmented=yes）不收录——它们会被 skip_ids 从完整数据中剔除
    print('[1/5] Reading segmented ways...')
    segmented_ways = []
    skip_ids = set()
    seg = ET.parse(segmented_osm)
    root = seg.getroot()
    for way in root.findall('way'):
        tags = {t.get('k'): t.get('v') for t in way.findall('tag')}

        if tags.get('parent_way'):
            # ✅ 新分段 way：有 parent_way 标签，收录它，并标记原始 way 需跳过
            skip_ids.add(int(tags['parent_way']))
            node_ids = [int(nd.get('ref')) for nd in way.findall('nd')]
            if len(node_ids) >= 2:
                segmented_ways.append({
                    'id': int(way.get('id')),
                    'node_ids': node_ids,
                    'tags': tags,
                })
        # ❌ 标记 segmented=yes 的原始 way：忽略，不收录

    print(f'  New segmented ways: {len(segmented_ways)}')
    print(f'  Original ways to skip: {len(skip_ids)}')

    # Step 2: 读取完整广州数据，跳过 pedestrian way
    print('[2/5] Reading full Guangzhou OSM (filtering pedestrian ways)...')
    handler = WayFilter(skip_ids)
    handler.apply_file(full_osm)
    print(f'  Kept ways: {len(handler.kept_ways)}')
    print(f'  Nodes: {len(handler.node_coords)}')

    # Step 3: 收集所有需要的节点
    print('[3/5] Collecting required nodes...')
    needed_nodes = set()
    for w in handler.kept_ways:
        for nid in w['node_ids']:
            needed_nodes.add(nid)
    for w in segmented_ways:
        for nid in w['node_ids']:
            needed_nodes.add(nid)
    print(f'  Unique nodes needed: {len(needed_nodes)}')

    # Step 4: 写入合并后的 OSM
    print(f'[4/5] Writing merged OSM: {output_osm}')
    with open(output_osm, 'w', encoding='utf-8') as f:
        f.write('<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n')
        f.write('<osm version="0.6" generator="merge_segmented.py">\n')

        # 按 ID 排序写入节点（planetiler 要求严格递增）
        sorted_node_ids = sorted(needed_nodes)
        for nid in sorted_node_ids:
            coord = handler.node_coords.get(nid)
            if coord:
                lon, lat = coord
                f.write(f'  <node id="{nid}" lat="{lat:.7f}" lon="{lon:.7f}"/>\n')

        # 写入保留的非 pedestrian way
        for w in handler.kept_ways:
            f.write(f'  <way id="{w["id"]}" version="{w["version"]}">\n')
            for nid in w['node_ids']:
                f.write(f'    <nd ref="{nid}"/>\n')
            for k, v in sorted(w['tags'].items()):
                v_esc = v.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
                f.write(f'    <tag k="{k}" v="{v_esc}"/>\n')
            f.write('  </way>\n')

        # 写入分段后的 pedestrian way
        for w in segmented_ways:
            f.write(f'  <way id="{w["id"]}" version="1">\n')
            for nid in w['node_ids']:
                f.write(f'    <nd ref="{nid}"/>\n')
            for k, v in sorted(w['tags'].items()):
                v_esc = str(v).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
                f.write(f'    <tag k="{k}" v="{v_esc}"/>\n')
            f.write('  </way>\n')

        f.write('</osm>\n')

    file_size = os.path.getsize(output_osm) / (1024 * 1024)
    print(f'  File size: {file_size:.1f}MB')

    # Step 5: 转 PBF
    print(f'[5/5] Converting to PBF...')
    import subprocess
    subprocess.run([
        osmium_path, 'cat', output_osm, '-o', output_pbf, '--overwrite'
    ], check=True)
    pbf_size = os.path.getsize(output_pbf) / (1024 * 1024)
    print(f'  PBF size: {pbf_size:.1f}MB')

    elapsed = time.time() - t0
    print(f'\n=== Done in {elapsed:.1f}s ===')
    print(f'Output: {output_osm}')
    print(f'PBF:    {output_pbf}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
