/**
 * 高德栅格瓦片代理路由
 *
 * GET /api/amap-tiles/:z/:x/:y.png        — 标准地图（style=8）
 * GET /api/amap-satellite/:z/:x/:y.png    — 卫星图（style=6）
 * GET /api/amap-roadnet/:z/:x/:y.png      — 路网叠加（style=8，上层透明显示）
 *
 * 高德瓦片使用 GCJ-02 坐标系，前端 MapLibre 需配合坐标转换使用。
 * 通过后端代理解决跨域问题，并设置缓存头优化性能。
 */

const express = require('express');
const https = require('https');

// ── 高德瓦被子域名 ────────────────────────────────
const RD_SUBDOMAINS = ['webrd01', 'webrd02', 'webrd03', 'webrd04'];
const ST_SUBDOMAINS = ['webst01', 'webst02', 'webst03', 'webst04'];
let rdIdx = 0;
let stIdx = 0;

function nextRd() {
  const s = RD_SUBDOMAINS[rdIdx];
  rdIdx = (rdIdx + 1) % RD_SUBDOMAINS.length;
  return s;
}

function nextSt() {
  const s = ST_SUBDOMAINS[stIdx];
  stIdx = (stIdx + 1) % ST_SUBDOMAINS.length;
  return s;
}

// ── 通用瓦片请求 ──────────────────────────────────

/**
 * @param {'rd'|'st'} subType — rd=普通地图子域, st=卫星子域
 * @param {number} style — 6=卫星, 8=标准
 */
function fetchTile(subType, style, z, x, y) {
  return new Promise((resolve, reject) => {
    const subdomain = subType === 'st' ? nextSt() : nextRd();
    const url = `https://${subdomain}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x=${x}&y=${y}&z=${z}`;

    const req = https.get(url, { timeout: 10000 }, (resp) => {
      if (resp.statusCode !== 200) {
        return reject(new Error(`Amap returned ${resp.statusCode}`));
      }
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── 路由处理工厂 ──────────────────────────────────

function makeRoute(subType, style) {
  return async (req, res) => {
    const z = parseInt(req.params.z, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) return res.status(400).send('Invalid tile');
    if (z < 0 || z > 18) return res.status(400).send('Zoom out of range');

    try {
      const data = await fetchTile(subType, style, z, x, y);
      // 根据实际格式判断 Content-Type（JPEG: 0xFFD8, PNG: 0x89504E47）
      const isJpeg = data[0] === 0xFF && data[1] === 0xD8;
      const contentType = isJpeg ? 'image/jpeg' : 'image/png';
      res.set({
        'Content-Type': contentType,
        'Content-Length': data.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(data);
    } catch (err) {
      console.warn(`[AmapTile ${subType}/s${style}] ${z}/${x}/${y}: ${err.message}`);
      const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      res.set({ 'Content-Type': 'image/png', 'Content-Length': emptyPng.length, 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
      res.send(emptyPng);
    }
  };
}

// ── 挂载路由 ──────────────────────────────────────

const router = express.Router();

// 标准地图（已有，保持兼容）
router.get('/:z/:x/:y.png', makeRoute('rd', 8));

module.exports = router;

// ── 卫星图 + 路网路由（单独导出给 server.js 挂载） ──

function satelliteRouter() {
  const r = express.Router();
  r.get('/:z/:x/:y.png', makeRoute('st', 6));
  return r;
}

function roadnetRouter() {
  const r = express.Router();
  r.get('/:z/:x/:y.png', makeRoute('rd', 8));
  return r;
}

module.exports.satelliteRouter = satelliteRouter;
module.exports.roadnetRouter = roadnetRouter;

// ── 路况瓦片（独立 URL 格式） ─────────────────────

function trafficRouter() {
  const r = express.Router();
  r.get('/:z/:x/:y.png', async (req, res) => {
    const z = parseInt(req.params.z, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) return res.status(400).send('Invalid tile');
    if (z < 0 || z > 18) return res.status(400).send('Zoom out of range');

    const url = `https://tm.amap.com/trafficengine/mapabc/traffictile?v=1.0&t=1&x=${x}&y=${y}&z=${z}`;

    try {
      const data = await new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 10000 }, (resp) => {
          if (resp.statusCode !== 200) return reject(new Error(`Traffic returned ${resp.statusCode}`));
          const chunks = [];
          resp.on('data', (c) => chunks.push(c));
          resp.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      const isJpeg = data[0] === 0xFF && data[1] === 0xD8;
      res.set({
        'Content-Type': isJpeg ? 'image/jpeg' : 'image/png',
        'Content-Length': data.length,
        'Cache-Control': 'public, max-age=120',  // 路况数据变化快，短缓存
        'Access-Control-Allow-Origin': '*',
      });
      res.send(data);
    } catch (err) {
      const emptyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      res.set({ 'Content-Type': 'image/png', 'Content-Length': emptyPng.length, 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' });
      res.send(emptyPng);
    }
  });
  return r;
}

module.exports.trafficRouter = trafficRouter;
