/**
 * SSE 路由
 * GET /stream?requestId=xxx
 */

const express = require('express');
const sseController = require('../controllers/sseController');

const router = express.Router();
router.get('/stream', sseController.stream);

module.exports = router;
