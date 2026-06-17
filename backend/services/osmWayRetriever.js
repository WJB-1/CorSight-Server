/**
 * OSM Way 检索服务
 *
 * 从 ragRetrievalService 中提取。
 * 批量查询 MongoDB osm_ways 集合。
 */

const mongoose = require('mongoose');

/**
 * 批量查询采样点附近的 OSM way
 * @param {Array<[number,number]>} sampleCoords
 * @param {number} [radiusM=50]
 * @returns {Promise<Map<string, Array>>} coordKey → elements
 */
async function retrieveOsmForRoute(sampleCoords, radiusM = 50) {
  if (!sampleCoords || sampleCoords.length === 0) return new Map();

  const OsmWay = mongoose.connection.collection('osm_ways');
  const resultMap = new Map();

  const queries = sampleCoords.map(async ([lng, lat]) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    try {
      const results = await OsmWay.find({
        geometry: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusM,
          },
        },
      }).limit(10).toArray();

      resultMap.set(key, results.map((r) => ({
        osm_id: r.osm_id,
        osm_type: r.osm_type || 'way',
        tags: r.tags || {},
      })));
    } catch (err) {
      console.warn(`[OSM-Way] Query error at (${lng},${lat}):`, err.message);
      resultMap.set(key, [{ _error: err.message }]);
    }
  });

  await Promise.all(queries);

  const hits = Array.from(resultMap.values()).filter((e) => e.length > 0).length;
  console.log(`[OSM-Way] Queried ${sampleCoords.length} points, ${hits} with results`);

  return resultMap;
}

module.exports = { retrieveOsmForRoute };
