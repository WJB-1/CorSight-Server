/**
 * Scene Scout 视觉提取提示词库 - Perception Agent
 * 
 * 模块 4.1：提示词工程 - 视觉提线木偶
 * 
 * 本模块从独立的 Markdown 文件加载各场景类型的提示词
 */

const {
  getPerceptionSystemPrompt,
  getSceneModelType,
  renderPrompt
} = require('./promptLoader');

// 场景类型定义
const SCENE_TYPES = {
  INTERSECTION: 'intersection',  // 路口/斑马线
  PATH: 'path',                  // 沿途路段
  FEATURE: 'feature',            // 特殊地形（天桥/地下通道/台阶等）
  DESTINATION: 'destination'     // 目的地
};

// 地形类型映射
const FEATURE_TYPES = {
  overpass: '天桥/人行天桥',
  underpass: '地下通道',
  steps: '台阶',
  elevator: '电梯',
  escalator: '扶梯',
  bridge: '桥梁'
};

/**
 * 获取路口描述提示词
 * 用于分析十字路口的 8 方位街景图像
 * 
 * @param {Object} params - 节点参数
 * @param {string} params.action - 动作描述
 * @param {string} params.clockDirection - 时钟方位
 * @returns {string} 完整的提示词
 */
function getIntersectionPrompt(params = {}) {
  const { action = '过马路', clockDirection = '12点钟方向' } = params;

  return getPerceptionSystemPrompt(SCENE_TYPES.INTERSECTION, {
    action,
    clock_direction: clockDirection
  });
}

/**
 * 获取沿途路段描述提示词
 * 用于分析非路口的沿途路段
 * 
 * @param {Object} params - 路段参数
 * @param {string} params.roadName - 道路名称
 * @param {string} params.orientation - 道路走向
 * @returns {string} 完整的提示词
 */
function getPathPrompt(params = {}) {
  const { roadName = '未知道路', orientation = '直行' } = params;

  return getPerceptionSystemPrompt(SCENE_TYPES.PATH, {
    road_name: roadName,
    orientation
  });
}

/**
 * 获取特殊地形描述提示词
 * 用于分析天桥、地下通道、台阶等特殊地形
 * 
 * @param {Object} params - 地形参数
 * @param {string} params.featureType - 地形类型 (overpass/underpass/steps/elevator)
 * @param {string} params.clockDirection - 时钟方位
 * @param {string} params.action - 动作描述
 * @returns {string} 完整的提示词
 */
function getFeaturePrompt(params = {}) {
  const {
    featureType = 'steps',
    clockDirection = '12点钟方向',
    action = '上台阶'
  } = params;

  const featureName = FEATURE_TYPES[featureType] || '特殊地形';

  return getPerceptionSystemPrompt(SCENE_TYPES.FEATURE, {
    feature_type: featureType,
    feature_name: featureName,
    action,
    clock_direction: clockDirection
  });
}

/**
 * 获取目的地周边描述提示词
 * 用于分析目的地附近的详细环境
 * 
 * @param {Object} params - 目的地参数
 * @param {string} params.placeName - 地点名称
 * @param {string} params.context - 上下文描述
 * @returns {string} 完整的提示词
 */
function getDestinationPrompt(params = {}) {
  const { placeName = '目的地', context = '到达目的地' } = params;

  return getPerceptionSystemPrompt(SCENE_TYPES.DESTINATION, {
    place_name: placeName,
    context
  });
}

/**
 * 根据节点类型获取对应的提示词
 * 
 * @param {string} nodeType - 节点类型
 * @param {Object} params - 节点参数
 * @returns {string} 对应的提示词
 */
function getPromptByNodeType(nodeType, params = {}) {
  switch (nodeType) {
    case 'intersection':
    case 'crossing':
      return getIntersectionPrompt(params);
    case 'overpass':
    case 'underpass':
    case 'steps':
    case 'elevator':
    case 'escalator':
      return getFeaturePrompt({ ...params, featureType: nodeType });
    case 'destination':
      return getDestinationPrompt(params);
    case 'path':
    default:
      return getPathPrompt(params);
  }
}

/**
 * 根据 walk_type 判断场景类型
 * walk_type 是高德API返回的最可靠结构化标识
 *
 * @param {number} walkType - walk_type 值
 * @returns {string|null} 场景类型标识
 */
function getSceneTypeFromWalkType(walkType) {
  if (walkType === undefined || walkType === null) return null;

  const wt = parseInt(walkType, 10);
  switch (wt) {
    case 1: return 'intersection';   // 人行横道
    case 3: return 'underpass';      // 地下通道
    case 4: return 'overpass';       // 过街天桥
    case 8: return 'escalator';      // 扶梯
    case 9: return 'elevator';       // 直梯
    case 12: return 'underpass';     // 建筑物穿越通道
    case 13: return 'underpass';     // 行人通道
    case 20: return 'steps';         // 阶梯
    case 21: return 'steps';         // 斜坡
    case 22: return 'overpass';      // 桥
    case 23: return 'underpass';     // 隧道
    default: return null;
  }
}

/**
 * 根据 action 判断场景类型
 *
 * @param {string} action - action 值
 * @returns {string|null} 场景类型标识
 */
function getSceneTypeFromAction(action) {
  if (!action) return null;

  const actionMap = {
    '通过人行横道': 'intersection',
    '通过过街天桥': 'overpass',
    '通过地下通道': 'underpass',
    '通过广场': 'intersection',
    '到道路斜对面': 'intersection',
    '左转': 'intersection',
    '右转': 'intersection',
    '向左前方': 'intersection',
    '向右前方': 'intersection',
    '向左后方': 'intersection',
    '向右后方': 'intersection',
    '调头': 'intersection',
    '掉头': 'intersection'
  };

  return actionMap[action] || null;
}

/**
 * 根据 assistant_action 判断场景类型
 *
 * @param {string} assistantAction - assistant_action 值
 * @returns {string|null} 场景类型标识
 */
function getSceneTypeFromAssistantAction(assistantAction) {
  if (!assistantAction) return null;
  if (assistantAction === '到达目的地') return 'destination';
  return null;
}

/**
 * 获取提示词选择指南
 * 用于根据节点特征自动选择合适的提示词
 *
 * 优先级：walk_type > action > assistant_action > instruction 文本兜底
 *
 * @param {Object} node - 节点数据
 * @returns {Object} 提示词类型和建议
 */
function selectPromptForNode(node) {
  // 1. 优先使用 walk_type（最可靠的结构化标识）
  let sceneType = getSceneTypeFromWalkType(node.walk_type);

  // 2. 使用 action 判断
  if (!sceneType) {
    sceneType = getSceneTypeFromAction(node.action);
  }

  // 3. 使用 assistant_action 判断
  if (!sceneType) {
    sceneType = getSceneTypeFromAssistantAction(node.assistant_action);
  }

  // 4. 兜底：instruction 文本关键词匹配
  if (!sceneType) {
    const instruction = (node.instruction || '').toLowerCase();
    const action = (node.action || '').toLowerCase();
    const text = `${action} ${instruction}`;

    if (text.includes('路口') || text.includes('斑马线') || text.includes('过街')) {
      sceneType = 'intersection';
    } else if (text.includes('天桥') || text.includes('人行天桥')) {
      sceneType = 'overpass';
    } else if (text.includes('地下通道') || text.includes('隧道')) {
      sceneType = 'underpass';
    } else if (text.includes('台阶') || text.includes('楼梯')) {
      sceneType = 'steps';
    } else if (text.includes('到达') || text.includes('目的地')) {
      sceneType = 'destination';
    }
  }

  // 5. 根据 node_type 做最终调整
  if (!sceneType && node.node_type === 'sample') {
    sceneType = 'path';
  }

  // 6. 默认 fallback
  if (!sceneType) {
    sceneType = 'path';
  }

  // 根据 sceneType 返回对应的提示词
  switch (sceneType) {
    case 'intersection':
      return {
        type: 'intersection',
        prompt: getIntersectionPrompt(node),
        description: '路口/过街场景',
        modelType: getSceneModelType('intersection')
      };
    case 'overpass':
      return {
        type: 'overpass',
        prompt: getFeaturePrompt({ ...node, featureType: 'overpass' }),
        description: '天桥场景',
        modelType: getSceneModelType('feature')
      };
    case 'underpass':
      return {
        type: 'underpass',
        prompt: getFeaturePrompt({ ...node, featureType: 'underpass' }),
        description: '地下通道场景',
        modelType: getSceneModelType('feature')
      };
    case 'steps':
      return {
        type: 'steps',
        prompt: getFeaturePrompt({ ...node, featureType: 'steps' }),
        description: '台阶场景',
        modelType: getSceneModelType('feature')
      };
    case 'elevator':
      return {
        type: 'elevator',
        prompt: getFeaturePrompt({ ...node, featureType: 'elevator' }),
        description: '电梯场景',
        modelType: getSceneModelType('feature')
      };
    case 'escalator':
      return {
        type: 'escalator',
        prompt: getFeaturePrompt({ ...node, featureType: 'escalator' }),
        description: '扶梯场景',
        modelType: getSceneModelType('feature')
      };
    case 'destination':
      return {
        type: 'destination',
        prompt: getDestinationPrompt(node),
        description: '目的地场景',
        modelType: getSceneModelType('destination')
      };
    case 'path':
    default:
      return {
        type: 'path',
        prompt: getPathPrompt(node),
        description: '沿途路段场景',
        modelType: getSceneModelType('path')
      };
  }
}

/**
 * 获取场景输出 Schema
 * @param {string} sceneType - 场景类型
 * @returns {Object} JSON Schema
 */
function getOutputSchema(sceneType) {
  const schemas = {
    intersection: {
      accessibility_analysis: {
        tactile_paving: 'string',
        audible_signals: 'string',
        crosswalk_width: 'string',
        surface_changes: 'string'
      },
      hazards: ['string'],
      landmarks: [{ description: 'string', direction: 'string', distance: 'string' }],
      mobility_cues: 'string'
    },
    path: {
      sidewalk: {
        width: 'string',
        surface: 'string',
        tactile_paving: 'string',
        obstacles: ['string']
      },
      immediate_surroundings: {
        left_side: 'string',
        right_side: 'string',
        ahead: 'string'
      },
      navigation_cues: ['string'],
      hazards: ['string'],
      confidence: 'string'
    },
    feature: {
      entrance: {
        location: 'string',
        width: 'string',
        tactile_paving: 'string',
        handrail: 'string'
      },
      structure: {
        type: 'string',
        segments: [{ type: 'string', count: 'string', landing: 'boolean' }],
        alternatives: 'string'
      },
      exit: {
        direction: 'string',
        surface: 'string',
        connection: 'string'
      },
      guidance: {
        tactile_cues: 'string',
        auditory_cues: 'string',
        safety_tips: 'string'
      },
      hazards: ['string']
    },
    destination: {
      path_summary: 'string',
      place_summary: 'string',
      mobility_cues: 'string',
      sidewalk: 'string',
      text: 'string',
      final_approach: 'string',
      entrance: 'string'
    }
  };

  return schemas[sceneType] || schemas.path;
}

module.exports = {
  // 场景类型常量
  SCENE_TYPES,
  FEATURE_TYPES,

  // 基础提示词函数
  getIntersectionPrompt,
  getPathPrompt,
  getFeaturePrompt,
  getDestinationPrompt,

  // 智能选择函数
  getPromptByNodeType,
  selectPromptForNode,

  // 场景类型判断函数（新增）
  getSceneTypeFromWalkType,
  getSceneTypeFromAction,
  getSceneTypeFromAssistantAction,

  // 工具函数
  getOutputSchema,
  getSceneModelType
};
