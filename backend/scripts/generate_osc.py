"""
OSM 补丁生成脚本（占位 — 待接入 shapely + pymongo）

职责：
- 从 MongoDB 读取 pending 的 semantic_tags
- 解析 workspace.osm，找到每个坐标最近的 way/node
- 生成 changes.osc 文件（XML 格式）
- 将匹配结果写回 MongoDB（matched_osm_id, matched_osm_type, match_distance_m）

用法：
    python generate_osc.py --mongodb-uri mongodb://localhost:27017/corsight_v2 \
                           --osm-file /path/to/workspace.osm \
                           --output /path/to/changes.osc \
                           --point-ids P_xxx,P_yyy

依赖：
    pip install shapely pymongo osmium
"""

import argparse
import json
import sys
from datetime import datetime

def parse_args():
    parser = argparse.ArgumentParser(description='Generate OSM change file from semantic tags')
    parser.add_argument('--mongodb-uri', required=True, help='MongoDB connection URI')
    parser.add_argument('--osm-file', required=True, help='Path to workspace.osm')
    parser.add_argument('--output', required=True, help='Output .osc file path')
    parser.add_argument('--point-ids', default='', help='Comma-separated point_ids (empty=all pending)')
    return parser.parse_args()

def main():
    args = parse_args()
    point_ids = [p.strip() for p in args.point_ids.split(',') if p.strip()] if args.point_ids else []

    print(json.dumps({
        'timestamp': datetime.now().isoformat(),
        'mongodb_uri': args.mongodb_uri,
        'osm_file': args.osm_file,
        'output': args.output,
        'point_ids': point_ids,
        'status': 'placeholder',
        'message': 'This script is a placeholder. Install shapely + pymongo + osmium to enable.',
    }))

    # ── 占位实现：生成空的 OSC 文件 ────────────────
    # 待接入真实逻辑后替换
    osc_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    osc_content += '<osmChange version="0.6">\n'
    osc_content += '  <!-- placeholder: no changes generated -->\n'
    osc_content += '</osmChange>\n'

    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(osc_content)

    # 输出 JSON 结果供 Node.js 读取
    result = {
        'status': 'placeholder',
        'matched': 0,
        'unmatched': 0,
        'errors': [],
        'output_file': args.output,
    }
    print(json.dumps(result))
    return 0

if __name__ == '__main__':
    sys.exit(main())
