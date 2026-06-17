"""
GCJ-02 → WGS-84 坐标批量转换脚本

将 semantic_tags 和 sampling_points 中的所有坐标从 GCJ-02 转为 WGS-84。
WGS-84 是 MapLibre GL / OSM 使用的标准坐标系。

用法：
  python gcj02_to_wgs84.py              # 预览模式（不修改数据库）
  python gcj02_to_wgs84.py --apply      # 执行转换
"""

import argparse
import math
import sys
from pymongo import MongoClient

# ── GCJ-02 ↔ WGS-84 转换算法 ─────────────────────

# Krasovsky 1940 椭球参数
A = 6378245.0  # 长半轴
EE = 0.00669342162296594  # 偏心率平方

def _out_of_china(lng, lat):
    """判断是否在中国境外（境外不做偏移）"""
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)

def _transform_lat(lng, lat):
    ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * math.sqrt(abs(lng))
    ret += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lat * math.pi) + 40.0 * math.sin(lat / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(lat / 12.0 * math.pi) + 320.0 * math.sin(lat * math.pi / 30.0)) * 2.0 / 3.0
    return ret

def _transform_lng(lng, lat):
    ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * math.sqrt(abs(lng))
    ret += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(lng * math.pi) + 40.0 * math.sin(lng / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(lng / 12.0 * math.pi) + 300.0 * math.sin(lng / 30.0 * math.pi)) * 2.0 / 3.0
    return ret

def gcj02_to_wgs84(lng, lat):
    """GCJ-02 坐标转 WGS-84"""
    if _out_of_china(lng, lat):
        return lng, lat

    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)

    radlat = lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - EE * magic * magic
    sqrtmagic = math.sqrt(magic)

    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (A / sqrtmagic * math.cos(radlat) * math.pi)

    return lng - dlng, lat - dlat


# ── 主流程 ───────────────────────────────────────

def convert_collection(db, collection_name, coord_field='location'):
    """转换一个集合中的所有坐标"""
    col = db[collection_name]
    docs = list(col.find({}))
    updated = 0
    skipped = 0

    for doc in docs:
        if coord_field == 'location':
            coords = doc.get('location', {}).get('coordinates')
            if not coords or len(coords) < 2:
                skipped += 1
                continue
            old_lng, old_lat = coords[0], coords[1]
        else:
            old_lng = doc.get('longitude')
            old_lat = doc.get('latitude')
            if old_lng is None or old_lat is None:
                skipped += 1
                continue

        new_lng, new_lat = gcj02_to_wgs84(old_lng, old_lat)
        diff_lng = new_lng - old_lng
        diff_lat = new_lat - old_lat
        diff_m = math.sqrt(diff_lng**2 + diff_lat**2) * 111320

        if diff_m < 1:
            skipped += 1
            continue

        print(f'  {doc.get("point_id", doc["_id"])}: '
              f'({old_lng:.6f}, {old_lat:.6f}) → ({new_lng:.6f}, {new_lat:.6f}) '
              f'[偏移 {diff_m:.0f}m]')

        updated += 1

    return updated, skipped


def main():
    parser = argparse.ArgumentParser(description='GCJ-02 → WGS-84 坐标转换')
    parser.add_argument('--apply', action='store_true', help='执行转换（否则只预览）')
    parser.add_argument('--mongodb-uri', default='mongodb://localhost:27017/blind_map')
    args = parser.parse_args()

    client = MongoClient(args.mongodb_uri)
    db = client.get_default_database()

    print('=' * 60)
    print('GCJ-02 → WGS-84 坐标转换')
    print(f'MongoDB: {args.mongodb_uri}')
    print(f'模式: {"执行" if args.apply else "预览"}')
    print('=' * 60)

    # 1. semantic_tags（location 字段）
    print(f'\n=== semantic_tags ===')
    tags = list(db['semantic_tags'].find({}))
    print(f'总记录: {len(tags)}')
    updated_tags = 0
    skipped_tags = 0

    for doc in tags:
        coords = doc.get('location', {}).get('coordinates')
        if not coords or len(coords) < 2:
            skipped_tags += 1
            continue

        old_lng, old_lat = coords[0], coords[1]
        new_lng, new_lat = gcj02_to_wgs84(old_lng, old_lat)
        diff_lng = new_lng - old_lng
        diff_lat = new_lat - old_lat
        diff_m = math.sqrt(diff_lng**2 + diff_lat**2) * 111320

        if diff_m < 1:
            skipped_tags += 1
            continue

        if updated_tags < 5:  # 预览只显示前 5 条
            print(f'  {doc["point_id"]}: ({old_lng:.6f},{old_lat:.6f}) → ({new_lng:.6f},{new_lat:.6f}) [{diff_m:.0f}m]')
        elif updated_tags == 5:
            print(f'  ...')

        updated_tags += 1

        if args.apply:
            db['semantic_tags'].update_one(
                {'_id': doc['_id']},
                {'$set': {
                    'location.coordinates': [new_lng, new_lat],
                    'updated_at': __import__('datetime').datetime.utcnow(),
                }}
            )

    print(f'转换: {updated_tags} 条, 跳过: {skipped_tags} 条')

    # 2. sampling_points
    print(f'\n=== sampling_points ===')
    sps = list(db['sampling_points'].find({}))
    print(f'总记录: {len(sps)}')
    updated_sp = 0
    skipped_sp = 0

    for doc in sps:
        coords = doc.get('location', {}).get('coordinates')
        if not coords or len(coords) < 2:
            skipped_sp += 1
            continue

        old_lng, old_lat = coords[0], coords[1]
        new_lng, new_lat = gcj02_to_wgs84(old_lng, old_lat)
        diff_lng = new_lng - old_lng
        diff_lat = new_lat - old_lat
        diff_m = math.sqrt(diff_lng**2 + diff_lat**2) * 111320

        if diff_m < 1:
            skipped_sp += 1
            continue

        if updated_sp < 5:
            print(f'  {doc["point_id"]}: ({old_lng:.6f},{old_lat:.6f}) → ({new_lng:.6f},{new_lat:.6f}) [{diff_m:.0f}m]')
        elif updated_sp == 5:
            print(f'  ...')

        updated_sp += 1

        if args.apply:
            db['sampling_points'].update_one(
                {'_id': doc['_id']},
                {'$set': {
                    'location.coordinates': [new_lng, new_lat],
                    'gcj02_converted': True,
                }}
            )

    print(f'转换: {updated_sp} 条, 跳过: {skipped_sp} 条')

    # 3. summary
    total_updated = updated_tags + updated_sp
    print(f'\n{"=" * 60}')
    print(f'总计: {total_updated} 条坐标需要转换')
    if not args.apply:
        print(f'\n确认无误后执行: python {sys.argv[0]} --apply')
    else:
        print(f'已转换完成！')

    client.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
