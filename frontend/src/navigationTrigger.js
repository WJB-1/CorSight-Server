/**
 * GPS 自动唤醒 + 语音交互模块
 *
 * 流程：
 * 1. 每 3 秒读取 GPS → 计算与所有 POI 节点的距离
 * 2. 进入 trigger_radius 范围 → 语音提示
 * 3. 语音识别（Web Speech API）→ 用户回复"好的"/"不用"
 * 4. 确认 → 调 LLM 生成讲解 → TTS 播报
 * 5. 播完 → 提示可继续探索子物件
 */

import { api } from './api.js';

// ── 状态 ─────────────────────────────────────────
let watchId = null;
let currentPosition = null;
let triggeredNodes = {};      // 已触发的节点 ID → 防重复
let isSpeaking = false;       // 正在播报中
let conversationActive = false; // 正在对话中（等待用户回应）
let pendingNode = null;       // 当前等待用户确认的节点
let allPOIs = [];             // 所有 POI 节点缓存

// ── 距离计算（Haversine 简化版） ──────────────────

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 加载所有 POI 节点 ────────────────────────────

async function loadPOIs() {
  try {
    const res = await api.get('/api/annotations?node_type=poi');
    if (res.success) allPOIs = (res.data || []).filter(n => !n.deleted);
    console.log('[NavTrigger] Loaded', allPOIs.length, 'POIs');
  } catch (err) {
    console.warn('[NavTrigger] Load POIs failed:', err.message);
  }
}

// ── 查找最近的 POI ───────────────────────────────

function findNearestPOI(lat, lng) {
  let nearest = null;
  let minDist = Infinity;

  for (const poi of allPOIs) {
    // 计算 POI 中心点（多边形取第一个点）
    let centerLat, centerLng;
    try {
      const coords = poi.geometry?.coordinates;
      if (poi.type === 'Polygon' || poi.geometry?.type === 'Polygon') {
        centerLng = coords[0][0][0];
        centerLat = coords[0][0][1];
      } else {
        centerLng = coords[0];
        centerLat = coords[1];
      }
    } catch { continue; }

    const dist = getDistance(lat, lng, centerLat, centerLng);
    if (dist < minDist) {
      minDist = dist;
      nearest = poi;
    }
  }

  const radius = nearest?.trigger_radius || 20;
  return { node: nearest, distance: minDist, inRange: minDist <= radius };
}

// ── 循环检测 ─────────────────────────────────────

function poll() {
  if (!currentPosition) return;

  const { lat, lng } = currentPosition;
  const result = findNearestPOI(lat, lng);

  if (result.inRange && result.node && !triggeredNodes[result.node._id] && !conversationActive && !isSpeaking) {
    // 触发！
    triggeredNodes[result.node._id] = true;
    pendingNode = result.node;
    conversationActive = true;

    const label = result.node.label || '此景点';
    speak(`您已到达${label}，需要了解它吗？请说"好的"或"不用"。`, () => {
      // 播完后开始语音识别
      startSpeechRecognition();
    });
  }

  // 如果离开了所有 POI 范围，清空触发记录
  if (!result.inRange) {
    // 检查是否完全离开了所有 POI
    let anyInRange = false;
    for (const poi of allPOIs) {
      let clat, clng;
      try {
        const coords = poi.geometry?.coordinates;
        clng = coords[0][0][0]; clat = coords[0][0][1];
      } catch { continue; }
      if (getDistance(lat, lng, clat, clng) <= (poi.trigger_radius || 20)) {
        anyInRange = true; break;
      }
    }
    if (!anyInRange && !conversationActive) {
      triggeredNodes = {};
    }
  }
}

// ── 模拟定位（金造村） ──────────────────────────

// 模拟用户位置：从金造村中心开始，可手动移动
const SIM_POSITION = { lat: 24.107455, lng: 112.961714, heading: 0 };

export async function startGPSTrigger() {
  await loadPOIs();

  // 使用模拟位置
  currentPosition = { ...SIM_POSITION };
  console.log('[NavTrigger] Using simulated position:', currentPosition);

  // 每 3 秒检查一次
  setInterval(poll, 3000);

  // 键盘控制模拟移动：W/S 前后，A/D 左右
  document.addEventListener('keydown', (e) => {
    const step = 0.00005; // 约 5 米
    switch (e.key.toLowerCase()) {
      case 'w': currentPosition.lat += step; break;
      case 's': currentPosition.lat -= step; break;
      case 'a': currentPosition.lng -= step; break;
      case 'd': currentPosition.lng += step; break;
    }
  });

  console.log('[NavTrigger] Simulated tracking started (WASD to move)');
}

export function stopGPSTrigger() {
  if (watchId !== null) {
    navigator.geolocation?.clearWatch(watchId);
    watchId = null;
  }
  window.speechSynthesis?.cancel();
  stopSpeechRecognition();
}

// ── 语音合成（TTS） ──────────────────────────────

function speak(text, onEnd) {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  isSpeaking = true;

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 0.9;
  utter.onend = () => {
    isSpeaking = false;
    if (onEnd) setTimeout(onEnd, 500); // 短暂停顿
  };
  window.speechSynthesis.speak(utter);
}

// ── 语音识别 ─────────────────────────────────────

let recognition = null;
let recognitionTimeout = null;

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[NavTrigger] Speech recognition not supported');
    // 回退：播完直接讲解（无确认）
    narrateCurrent();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const said = event.results[0][0].transcript.trim();
    console.log('[NavTrigger] User said:', said);
    clearTimeout(recognitionTimeout);

    if (/好的|可以|行|嗯|讲讲|讲吧|是的|要/.test(said)) {
      narrateCurrent();
    } else if (/不用|不要|不|算了|别/.test(said)) {
      speak('好的，有需要随时叫我。', () => {
        conversationActive = false;
        pendingNode = null;
      });
    } else {
      speak('抱歉我没听清，您说"好的"还是"不用"？', () => {
        startSpeechRecognition();
      });
    }
  };

  recognition.onerror = (event) => {
    console.warn('[NavTrigger] Recognition error:', event.error);
    clearTimeout(recognitionTimeout);
    // 回退：直接讲解
    narrateCurrent();
  };

  recognition.start();
  // 8 秒超时
  recognitionTimeout = setTimeout(() => {
    stopSpeechRecognition();
    speak('抱歉没听到您的回应，您可以点屏幕上的按钮来听讲解。', () => {
      conversationActive = false;
      pendingNode = null;
    });
  }, 8000);
}

function stopSpeechRecognition() {
  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }
}

// ── 生成并播报讲解 ──────────────────────────────

async function narrateCurrent() {
  if (!pendingNode) return;

  const node = pendingNode;
  conversationActive = false;

  speak('好的，让我为您介绍。', async () => {
    try {
      const res = await api.post('/api/heritage/narrate', {
        annotation_id: node._id,
        mode: 'welcome',
      });
      if (res.success && res.data?.text) {
        speak(res.data.text, () => {
          // 提示子物件
          promptSubItems(node);
        });
      }
    } catch (err) {
      speak('讲解生成失败，请稍后再试。');
    }
    pendingNode = null;
  });
}

async function promptSubItems(node) {
  const subs = node.knowledge?.sub_items || [];
  const stories = node.knowledge?.stories || [];

  if (subs.length > 0) {
    const names = subs.slice(0, 3).map(s => s.name).join('、');
    speak(`您想了解里面的具体物件吗？比如${names}。说"不用"跳过。`, () => {
      startSubItemRecognition(node);
    });
  } else if (stories.length > 0) {
    const titles = stories.slice(0, 3).map(s => s.title).join('、');
    speak(`这里还有几段故事，比如${titles}。说故事名字我可以讲给您听。`);
  }
  conversationActive = false;
}

function startSubItemRecognition(node) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const rec = new SpeechRecognition();
  rec.lang = 'zh-CN';
  rec.interimResults = false;

  rec.onresult = async (event) => {
    const said = event.results[0][0].transcript.trim();
    if (/不用|不要|不|算了|跳过/.test(said)) {
      speak('好的，有需要随时叫我。');
      return;
    }

    // 匹配子物件名
    const subs = (node.knowledge?.sub_items || []).find(s => said.includes(s.name));
    if (subs) {
      try {
        const res = await api.post('/api/heritage/narrate', {
          annotation_id: node._id, mode: 'detail', extra: { sub_item: subs.name }
        });
        if (res.success && res.data?.text) {
          speak(res.data.text);
        }
      } catch { speak('抱歉，讲解暂时无法生成。'); }
    } else {
      speak('抱歉我没听懂，您可以说物件的名字。');
    }
  };

  rec.onerror = () => { /* 静默失败 */ };
  rec.start();
}

export { currentPosition, allPOIs };
