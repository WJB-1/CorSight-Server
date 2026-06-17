/**
 * 道路标签路由
 *
 * GET  /geojson?minLng=&minLat=&maxLng=&maxLat=  — bbox 查询 GeoJSON
 * GET  /at?lng=&lat=                             — 坐标精确查道路
 * GET  /pending/list                              — 所有待注入标签
 * GET  /:osmId                                    — 获取道路标签
 * POST /:osmId                                    — 创建/更新增强标签
 * DELETE /:osmId                                  — 删除增强标签
 */

const express = require('express');
const roadController = require('../controllers/roadController');

const router = express.Router();

router.get('/geojson', roadController.getGeoJSON);
router.get('/at', roadController.getWayAt);
router.get('/pending/list', roadController.getPendingList);
router.get('/:osmId', roadController.getTags);
router.post('/:osmId', roadController.upsertTags);
router.delete('/:osmId', roadController.deleteTags);

module.exports = router;
