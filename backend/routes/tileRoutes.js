/**
 * 矢量瓦片路由
 *
 * GET /api/tiles/:z/:x/:y.pbf — 返回矢量瓦片
 * GET /api/tiles/tilejson      — 返回 TileJSON 元数据
 *
 * 数据源：planetiler 生成的原始广州市瓦片（guangzhou_full.mbtiles）
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const MBTiles = require('@mapbox/mbtiles');
const config = require('../config/envConfig');

const router = express.Router();

const MBTILES_PATH = path.join(config.osm.OSM_DATA_DIR, 'guangzhou_full.mbtiles');
let mbtilesInstance = null;

function getMbtiles(cb) {
  if (mbtilesInstance) return cb(null, mbtilesInstance);

  if (!fs.existsSync(MBTILES_PATH)) {
    const err = new Error(`MBTiles not found: ${MBTILES_PATH}`);
    console.error('[Tile]', err.message);
    return cb(err);
  }

  new MBTiles(MBTILES_PATH + '?mode=ro', (err, instance) => {
    if (err) return cb(err);
    mbtilesInstance = instance;
    cb(null, instance);
  });
}

router.get('/tilejson', (req, res) => {
  getMbtiles((err, instance) => {
    if (err) return res.status(500).json({ error: 'Failed to open mbtiles' });
    instance.getInfo((err, info) => {
      if (err) return res.status(500).json({ error: 'Failed to read tile info' });
      res.json({
        tilejson: '3.0.0',
        name: info.name || 'CorSight Guangzhou',
        description: 'Guangzhou vector tiles',
        version: '1.0.0',
        attribution: info.attribution || '© OpenMapTiles © OpenStreetMap contributors',
        scheme: 'xyz',
        tiles: ['/api/tiles/{z}/{x}/{y}.pbf'],
        minzoom: info.minzoom || 0,
        maxzoom: info.maxzoom || 15,
        bounds: info.bounds || [113.1, 22.9, 113.6, 23.4],
        center: info.center || [113.33, 23.14, 12],
      });
    });
  });
});

router.get('/:z/:x/:y.pbf', (req, res) => {
  const z = parseInt(req.params.z, 10);
  const x = parseInt(req.params.x, 10);
  const y = parseInt(req.params.y, 10);
  if (isNaN(z) || isNaN(x) || isNaN(y)) return res.status(400).send('Invalid coordinates');

  getMbtiles((err, instance) => {
    if (err) return res.status(500).send('MBTiles not available');
    instance.getTile(z, x, y, (err, data) => {
      if (err) return res.status(204).end();
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
