/**
 * 矢量瓦片路由
 *
 * GET /api/tiles/:z/:x/:y.pbf — 返回 Mapbox Vector Tile
 * GET /api/tiles/tilejson      — 返回 TileJSON 元数据
 *
 * 数据源：planetiler 生成的 guangzhou.mbtiles
 */

const express = require('express');
const path = require('path');
const MBTiles = require('@mapbox/mbtiles');
const config = require('../config/envConfig');

const router = express.Router();

const MBTILES_PATH = path.join(config.osm.OSM_DATA_DIR, 'guangzhou.mbtiles');

let mbtiles = null;

/**
 * 懒加载 mbtiles 实例
 */
function getMbtiles(cb) {
  if (mbtiles) return cb(null, mbtiles);
  new MBTiles(MBTILES_PATH + '?mode=ro', (err, instance) => {
    if (err) return cb(err);
    mbtiles = instance;
    cb(null, instance);
  });
}

/**
 * GET /api/tiles/tilejson — TileJSON 元数据
 */
router.get('/tilejson', (req, res) => {
  getMbtiles((err, instance) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to open mbtiles' });
    }

    instance.getInfo((err, info) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to read tile info' });
      }

      const host = `${req.protocol}://${req.get('host')}`;
      res.json({
        tilejson: '3.0.0',
        name: info.name || 'CorSight Guangzhou',
        description: info.description || 'Guangzhou vector tiles',
        version: '1.0.0',
        attribution: info.attribution || '© OpenMapTiles © OpenStreetMap contributors',
        scheme: 'xyz',
        tiles: [`${host}/api/tiles/{z}/{x}/{y}.pbf`],
        minzoom: info.minzoom || 0,
        maxzoom: info.maxzoom || 14,
        bounds: info.bounds || [113.1, 22.9, 113.6, 23.4],
        center: info.center || [113.33, 23.14, 12],
      });
    });
  });
});

/**
 * GET /api/tiles/:z/:x/:y.pbf — 返回矢量瓦片
 */
router.get('/:z/:x/:y.pbf', (req, res) => {
  const z = parseInt(req.params.z, 10);
  const x = parseInt(req.params.x, 10);
  const y = parseInt(req.params.y, 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return res.status(400).send('Invalid tile coordinates');
  }

  getMbtiles((err, instance) => {
    if (err) {
      return res.status(500).send('Failed to open mbtiles');
    }

    instance.getTile(z, x, y, (err, data, headers) => {
      if (err) {
        // 该层级/坐标没有瓦片（正常，不是所有区域都有数据）
        return res.status(204).end();
      }

      res.set({
        'Content-Type': 'application/x-protobuf',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(data);
    });
  });
});

module.exports = router;
