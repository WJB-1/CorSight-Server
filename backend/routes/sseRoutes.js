/**
 * SSE 路由
 * GET /stream?requestId=xxx
 */

const express = require('express');
const sseController = require('../controllers/sseController');

const router = express.Router();
router.get('/stream', sseController.stream);
router.get('/events', sseController.events);

module.exports = router;
