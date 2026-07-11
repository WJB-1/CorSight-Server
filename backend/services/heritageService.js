/**
 * 文物讲解服务 — 知识图谱 + LLM 讲解生成
 *
 * 流程：
 * 1. 加载标注节点的知识图谱（从 DB）
 * 2. 根据讲解模式选择提示词模板
 * 3. 填充模板变量
 * 4. 调用 LLM（qwen-plus）生成讲解文本
 * 5. 返回讲解内容供前端 TTS 播报
 */

const fs = require('fs');
const path = require('path');
const annotationService = require('./annotationService');

// ── LLM 客户端（复用项目已有的百炼 DashScope） ──────
function getLLMClient() {
  const OpenAI = require('openai');
  const config = require('../config/envConfig');
  if (!config.llm.BAILIAN_API_KEY) throw new Error('BAILIAN_API_KEY not configured');
  return new OpenAI({
    apiKey: config.llm.BAILIAN_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
}

// ── 提示词模板缓存 ──────────────────────────────────
const templateCache = new Map();
const TEMPLATE_DIR = path.join(__dirname, '..', 'prompts', 'templates');

function loadTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const filePath = path.join(TEMPLATE_DIR, `heritage-${name}.md`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[Heritage] Template not found: ${filePath}`);
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  templateCache.set(name, content);
  return content;
}

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ── 核心：生成讲解 ──────────────────────────────────

/**
 * @param {string} annotationId — 标注节点 ID
 * @param {string} mode — 'welcome' | 'detail' | 'story' | 'path'
 * @param {object} extra — 额外参数 { sub_item?, story_title?, from_label?, to_label? }
 * @returns {Promise<{text: string, mode: string, label: string}>}
 */
async function generateNarration(annotationId, mode = 'welcome', extra = {}) {
  // 1. 加载节点数据
  const node = await annotationService.getById(annotationId);
  if (!node) throw new Error('节点不存在');

  const isPoi = node.node_type === 'poi' || node.type === 'Polygon';
  const k = node.knowledge || {};

  // 2. 选择模板 + 构造变量
  let templateName, vars;

  if (isPoi && mode === 'welcome') {
    templateName = 'welcome';
    vars = {
      label: node.label || '此景点',
      summary: k.summary || '暂无概述',
      period: k.historical_period || '未知',
      people: (k.related_people || []).join('、') || '暂无记录',
    };
  } else if (isPoi && mode === 'detail' && extra.sub_item) {
    templateName = 'detail';
    const sub = (k.sub_items || []).find(s => s.name === extra.sub_item) || {};
    vars = {
      label: node.label || '此景点',
      sub_item: extra.sub_item,
      sub_desc: sub.description || '暂无描述',
      period: k.historical_period || '未知',
      people: (k.related_people || []).join('、') || '暂无记录',
    };
  } else if (isPoi && mode === 'story' && extra.story_index !== undefined) {
    templateName = 'story';
    const story = (k.stories || [])[extra.story_index] || {};
    vars = {
      label: node.label || '此景点',
      story_title: story.title || '未命名故事',
      story_content: story.content || '暂无内容',
      period: k.historical_period || '未知',
      people: (k.related_people || []).join('、') || '暂无记录',
    };
  } else if (!isPoi && mode === 'path') {
    templateName = 'path';
    const wps = (node.waypoints || []).map((w, i) =>
      `第${i + 1}步：${w.description || ''}（${w.action || '直行'}）`
    ).join('\n');
    vars = {
      from_label: extra.from_label || '当前位置',
      to_label: node.label || '目的地',
      waypoints_text: wps || '暂无关键节点',
      surface: node.surface || '未知',
      difficulty: node.difficulty || '未知',
    };
  } else {
    // 回退：使用节点自定义提示词
    templateName = 'welcome';
    vars = {
      label: node.label || '此景点',
      summary: k.summary || '暂无概述',
      period: k.historical_period || '未知',
      people: (k.related_people || []).join('、') || '暂无记录',
    };
  }

  // 3. 加载 + 填充模板 → 系统提示词
  const template = loadTemplate(templateName);
  if (!template) {
    // 无模板时的回退：直接用节点概述
    return { text: k.summary || `欢迎来到${node.label || '此景点'}`, mode, label: node.label };
  }
  const systemPrompt = fillTemplate(template, vars);

  // 4. 可选：使用节点自定义 prompt 覆盖
  const customPrompt = (node.prompts || {})[mode];
  const finalSystemPrompt = customPrompt || systemPrompt;

  // 5. 调用 LLM
  try {
    const client = getLLMClient();
    const response = await client.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: mode === 'welcome' ? '请开始讲解' : '请讲述' },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';
    return { text: text || k.summary || '暂无讲解内容', mode, label: node.label };
  } catch (err) {
    console.error('[Heritage] LLM error:', err.message);
    // LLM 不可用时返回知识图谱原始内容
    let fallback = '';
    if (mode === 'welcome') fallback = k.summary || `欢迎来到${node.label}`;
    else if (mode === 'detail') fallback = (k.sub_items || []).find(s => s.name === extra.sub_item)?.description || '';
    else if (mode === 'story') fallback = (k.stories || [])[extra.story_index]?.content || '';
    else fallback = `请沿路径前往${node.label}`;
    return { text: fallback, mode, label: node.label };
  }
}

// ── 查找最近节点 ──────────────────────────────────

/**
 * 根据 GPS 坐标查找最近的节点（POI 或 Path）
 * @param {number} lat
 * @param {number} lng
 * @param {number} radius — 搜索半径（米），默认 50
 * @returns {{ node: object|null, distance_m: number, in_range: boolean }}
 */
async function findNearest(lat, lng, radius = 50) {
  const R = 6371000;

  // 简易：加载所有节点，在内存中算距离。数据量大时改用 MongoDB $near。
  const allNodes = await annotationService.getAll({ limit: 1000 });
  let nearest = null;
  let minDist = Infinity;

  for (const node of allNodes) {
    let centerLat, centerLng;
    try {
      const coords = node.geometry?.coordinates;
      const isPoly = node.type === 'Polygon' || node.geometry?.type === 'Polygon';
      if (isPoly) {
        centerLng = coords[0][0][0];
        centerLat = coords[0][0][1];
      } else {
        centerLng = coords[0][0];
        centerLat = coords[0][1];
      }
    } catch { continue; }

    const dLat = (centerLat - lat) * Math.PI / 180;
    const dLng = (centerLng - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(centerLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return {
    node: nearest,
    distance_m: Math.round(minDist * 10) / 10,
    in_range: minDist <= (nearest?.trigger_radius || radius),
  };
}

// ── 视觉识别 + 匹配 ──────────────────────────────

/**
 * 安卓端拍照 → VLM 识别 → 匹配最近 POI 的知识图谱
 * @param {string} imageBase64 — data:image/jpeg;base64,...
 * @param {number} lat — 当前 GPS 纬度
 * @param {number} lng — 当前 GPS 经度
 * @returns {{ matched: boolean, poi: object|null, narration: string, vlm_raw: string }}
 */
async function identifyByVision(imageBase64, lat, lng) {
  // 1. 找到大致区域内的 POI
  const { node: nearestPOI } = await findNearest(lat, lng, 100);
  if (!nearestPOI) {
    return { matched: false, poi: null, narration: '当前位置附近没有注册的文物节点', vlm_raw: '' };
  }

  // 2. 构造 VLM prompt，列出该 POI 下的子物件供匹配
  const subItems = (nearestPOI.knowledge?.sub_items || [])
    .map(s => `- ${s.name}：${s.visual_clue || s.description || ''}`)
    .join('\n');

  const vlmPrompt = `你是一个文物识别助手。请判断这张照片中是否包含以下物品之一：

${subItems || '(该景点暂无注册子物件)'}

请以 JSON 格式返回：
{ "found": true/false, "item_name": "匹配到的物品名（未找到则为空）", "confidence": 0.0-1.0, "description": "简短描述画面内容" }`;

  // 3. 调用 VLM
  try {
    const OpenAI = require('openai');
    const config = require('../config/envConfig');
    const client = new OpenAI({
      apiKey: config.llm.BAILIAN_API_KEY,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const response = await client.chat.completions.create({
      model: 'qwen-vl-plus',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: vlmPrompt },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const raw = response.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }

    if (parsed?.found && parsed.item_name) {
      // 匹配到了子物件，生成讲解
      const narration = await generateNarration(nearestPOI._id.toString(), 'detail', { sub_item: parsed.item_name });
      return {
        matched: true,
        poi: { _id: nearestPOI._id, label: nearestPOI.label, category: nearestPOI.category },
        item_name: parsed.item_name,
        confidence: parsed.confidence,
        narration: narration.text,
        vlm_raw: raw,
      };
    }

    return {
      matched: false,
      poi: { _id: nearestPOI._id, label: nearestPOI.label, category: nearestPOI.category },
      narration: '',
      vlm_raw: raw,
    };
  } catch (err) {
    console.error('[Heritage] VLM identify error:', err.message);
    return { matched: false, poi: null, narration: '', vlm_raw: '', error: err.message };
  }
}

module.exports = { generateNarration, findNearest, identifyByVision };
