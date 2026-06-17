/**
 * 实时导航指引路由
 *
 * POST /api/guide/session   — 创建指引会话（路线规划后调用）
 * POST /api/guide/frame     — 提交一帧摄像头画面，获取指引
 * POST /api/guide/stop      — 结束指引会话
 * GET  /api/guide/status    — 查询会话状态
 *
 * 数据流：
 *   前端摄像头 → base64 JPEG → POST /frame → 后端 VLM 分析
 *   → 滚动摘要更新 → 返回指引文本 → 前端 TTS 播报
 */

const express = require('express');
const multer = require('multer');
const realtimeGuideService = require('../services/realtimeGuideService');

const router = express.Router();

// multer 用于接收 frame 帧（内存存储，限制 2MB）
const frameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// ── 创建指引会话 ─────────────────────────────────

/**
 * POST /api/guide/session
 * Body: { routeData: object }
 *
 * 前端规划路线后，调用此接口启动实时指引。
 * routeData 是 routeService.getRoute() 返回的完整路线数据。
 */
router.post('/session', (req, res) => {
  try {
    const { routeData } = req.body;

    if (!routeData || !routeData.coords || !routeData.steps) {
      return res.status(400).json({
        success: false,
        error: 'invalid_route',
        message: 'routeData 必须包含 coords 和 steps',
      });
    }

    const sessionId = realtimeGuideService.createSession(routeData);

    return res.status(201).json({
      success: true,
      session_id: sessionId,
      message: '指引会话已创建',
      config: {
        min_interval_ms: realtimeGuideService.DEFAULTS.MIN_INTERVAL_MS,
        offtrack_threshold: realtimeGuideService.DEFAULTS.OFFTRACK_THRESHOLD,
      },
    });
  } catch (err) {
    console.error('[GuideRoutes] createSession error:', err);
    return res.status(500).json({ success: false, message: '创建指引会话失败' });
  }
});

// ── 提交帧 ───────────────────────────────────────

/**
 * POST /api/guide/frame
 *
 * 两种提交方式：
 *   a) multipart/form-data — frame 字段为图片文件
 *   b) application/json — { frame_base64, current_position }
 *
 * Body (JSON模式):
 *   {
 *     session_id: string,
 *     frame_base64: string,       // data:image/jpeg;base64,...
 *     current_position?: { lng: number, lat: number }
 *   }
 *
 * Body (multipart模式):
 *   session_id: string
 *   frame: File (JPEG)
 *   current_lng?: number
 *   current_lat?: number
 */
router.post('/frame', frameUpload.single('frame'), async (req, res) => {
  try {
    let sessionId;
    let frameBase64;
    let currentPos = null;

    if (req.file) {
      // multipart 模式：收到的是图片文件
      sessionId = req.body.session_id;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'missing_session', message: 'session_id 必填' });
      }

      // 将图片 buffer 转 base64
      const base64 = req.file.buffer.toString('base64');
      const mime = req.file.mimetype || 'image/jpeg';
      frameBase64 = `data:${mime};base64,${base64}`;

      // 可选的位置信息
      if (req.body.current_lng && req.body.current_lat) {
        currentPos = {
          lng: parseFloat(req.body.current_lng),
          lat: parseFloat(req.body.current_lat),
        };
      }
    } else {
      // JSON 模式
      const body = req.body;
      sessionId = body.session_id;
      frameBase64 = body.frame_base64;

      if (!sessionId || !frameBase64) {
        return res.status(400).json({
          success: false,
          error: 'missing_params',
          message: 'session_id 和 frame_base64 必填',
        });
      }

      if (body.current_position) {
        currentPos = body.current_position;
      }
    }

    // 处理帧
    const result = await realtimeGuideService.processFrame(sessionId, frameBase64, currentPos);

    return res.json(result);
  } catch (err) {
    console.error('[GuideRoutes] processFrame error:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '帧处理失败',
    });
  }
});

// ── 结束指引会话 ─────────────────────────────────

/**
 * POST /api/guide/stop
 * Body: { session_id: string }
 */
router.post('/stop', (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) {
      return res.status(400).json({ success: false, error: 'missing_session', message: 'session_id 必填' });
    }

    realtimeGuideService.destroySession(session_id);

    return res.json({ success: true, message: '指引会话已结束' });
  } catch (err) {
    console.error('[GuideRoutes] stop error:', err);
    return res.status(500).json({ success: false, message: '结束会话失败' });
  }
});

// ── 查询会话状态 ─────────────────────────────────

/**
 * GET /api/guide/status?session_id=xxx
 */
router.get('/status', (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ success: false, error: 'missing_session', message: 'session_id 必填' });
    }

    const session = realtimeGuideService.getSession(session_id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'not_found', message: '会话不存在或已结束' });
    }

    return res.json({
      success: true,
      data: {
        session_id: session.sessionId,
        is_active: session.isActive,
        total_frames_processed: session.totalFramesProcessed,
        current_step_index: session.currentStepIndex,
        created_at: session.createdAt,
        last_processed_at: session.lastProcessedAt,
        rolling_context_length: session.rollingContext.length,
        consecutive_offtrack: session.rollingContext.getConsecutiveOffTrack(),
      },
    });
  } catch (err) {
    console.error('[GuideRoutes] status error:', err);
    return res.status(500).json({ success: false, message: '查询失败' });
  }
});

module.exports = router;
