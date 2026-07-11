/**
 * 文物讲解路由
 */

const express = require('express');
const controller = require('../controllers/heritageController');

const router = express.Router();

router.post('/narrate', controller.narrate);
router.post('/nearest', controller.nearest);
router.post('/identify', controller.identify);

module.exports = router;
