/**
 * Polyline 解码 + 沿线采样工具（纯函数）
 *
 * - decodePolyline — 解码高德/GH 编码 polyline
 * - sampleAlongPath — 沿路径等距采样 + 拐点必采
 * - computePathBearing — 计算路径上某点的行进方向
 */

const geo = require('./geo');

/**
 * 解码 polyline 字符串为坐标数组
 * 高德和 GraphHopper 都使用 Google polyline 编码格式
 *
 * @param {string} encoded
 * @returns {Array<[number, number]>} [[lng, lat], ...]
 */
function decodePolyline(encoded) {
  const coords = [];
  let lat = 0;
  let lng = 0;
  let index = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lng / 1e5, lat / 1e5]);
  }

  return coords;
}

/**
 * 沿路径等距采样 + 拐点必采
 *
 * @param {Array<[number,number]>} coords — 路径坐标序列 [[lng,lat], ...]
 * @param {number} intervalM — 等距采样间隔（米）
 * @param {Array<[number,number]>} [waypoints] — 必须包含的拐点坐标（可选）
 * @returns {Array<{ coord: [number,number], index: number, isWaypoint: boolean, bearing: number }>}
 */
function sampleAlongPath(coords, intervalM, waypoints = []) {
  if (!coords || coords.length < 2) return [];

  // 1. 计算每个点到起点的累积距离
  const cumulativeDist = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulativeDist.push(
      cumulativeDist[i - 1] + geo.haversineDistance(coords[i - 1], coords[i])
    );
  }
  const totalDistance = cumulativeDist[cumulativeDist.length - 1];

  // 2. 等距采样
  const samples = [];
  let nextSampleDist = 0;
  let segIndex = 0;

  while (nextSampleDist <= totalDistance) {
    // 找到 nextSampleDist 落在哪一段
    while (segIndex < coords.length - 1 && cumulativeDist[segIndex + 1] < nextSampleDist) {
      segIndex++;
    }
    if (segIndex >= coords.length - 1) break;

    // 在该段内插值
    const segStart = cumulativeDist[segIndex];
    const segEnd = cumulativeDist[segIndex + 1];
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (nextSampleDist - segStart) / segLen : 0;

    const lng = coords[segIndex][0] + t * (coords[segIndex + 1][0] - coords[segIndex][0]);
    const lat = coords[segIndex][1] + t * (coords[segIndex + 1][1] - coords[segIndex][1]);

    samples.push({
      coord: [lng, lat],
      segmentIndex: segIndex,
      isWaypoint: false,
    });

    nextSampleDist += intervalM;
  }

  // 3. 插入拐点（在最近的路径点处标记）
  for (const wp of waypoints) {
    // 找到拐点最近的路径点
    let minDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = geo.haversineDistance(wp, coords[i]);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    // 检查是否已有等距采样点在附近（30m 内不重复）
    const wpDist = cumulativeDist[nearestIdx];
    const tooClose = samples.some((s) => {
      const sDist = cumulativeDist[s.segmentIndex];
      return Math.abs(sDist - wpDist) < 30;
    });

    if (!tooClose) {
      // 插入到正确位置（按累积距离排序）
      const entry = {
        coord: coords[nearestIdx],
        segmentIndex: nearestIdx,
        isWaypoint: true,
      };
      let insertIdx = samples.length;
      for (let i = 0; i < samples.length; i++) {
        if (cumulativeDist[samples[i].segmentIndex] > wpDist) {
          insertIdx = i;
          break;
        }
      }
      samples.splice(insertIdx, 0, entry);
    } else {
      // 标记最近的已有采样点为拐点
      let closestSample = samples[0];
      let closestDist = Infinity;
      for (const s of samples) {
        const d = geo.haversineDistance(wp, s.coord);
        if (d < closestDist) {
          closestDist = d;
          closestSample = s;
        }
      }
      closestSample.isWaypoint = true;
    }
  }

  // 4. 计算每个采样点的行进方向 bearing
  for (const sample of samples) {
    const idx = sample.segmentIndex;
    const nextIdx = Math.min(idx + 1, coords.length - 1);
    sample.bearing = geo.calculateBearing(coords[idx], coords[nextIdx]);
  }

  return samples;
}

/**
 * 计算路径上某段的行进方向
 * @param {Array<[number,number]>} coords
 * @param {number} segmentIndex
 * @returns {number} bearing (度)
 */
function computePathBearing(coords, segmentIndex) {
  const idx = Math.min(segmentIndex, coords.length - 2);
  return geo.calculateBearing(coords[idx], coords[idx + 1]);
}

module.exports = {
  decodePolyline,
  sampleAlongPath,
  computePathBearing,
};
