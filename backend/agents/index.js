/**
 * Agent 注册中心
 *
 * 模块 4.3：Agent 注册与分发
 *
 * 提供统一的 Agent 注册、查找和调用接口。
 * 所有子 Agent 实现相同的 analyze(node, imagePaths, heading) 接口。
 */

const intersectionAgent = require('./intersectionAgent');
const terrainAgent = require('./terrainAgent');
const pathSegmentAgent = require('./pathSegmentAgent');
const destinationAgent = require('./destinationAgent');

/**
 * Agent 注册表
 * key: 场景类型标识
 * value: Agent 模块对象（必须实现 analyze() 方法）
 */
const AGENT_REGISTRY = {
    'intersection': intersectionAgent,    // 路口/斑马线
    'overpass': terrainAgent,             // 天桥
    'underpass': terrainAgent,            // 地下通道/隧道/行人通道
    'steps': terrainAgent,                // 台阶/阶梯/斜坡
    'elevator': terrainAgent,             // 电梯
    'escalator': terrainAgent,            // 扶梯
    'path': pathSegmentAgent,             // 普通路段/采样点
    'destination': destinationAgent       // 目的地
};

/**
 * 获取指定场景类型的 Agent
 *
 * @param {string} sceneType - 场景类型标识
 * @returns {Object} Agent 模块（含 analyze 方法）
 */
function getAgent(sceneType) {
    const agent = AGENT_REGISTRY[sceneType];
    if (!agent) {
        console.warn(`[AgentRegistry] 未知场景类型: ${sceneType}，使用默认 path Agent`);
        return AGENT_REGISTRY['path'];
    }
    return agent;
}

/**
 * 列出所有已注册的 Agent
 *
 * @returns {Array} Agent 信息列表
 */
function listAgents() {
    return Object.entries(AGENT_REGISTRY).map(([type, agent]) => ({
        type,
        name: agent.name || type,
        description: agent.description || ''
    }));
}

/**
 * 检查指定场景类型是否有对应的 Agent
 *
 * @param {string} sceneType - 场景类型
 * @returns {boolean}
 */
function hasAgent(sceneType) {
    return !!AGENT_REGISTRY[sceneType];
}

module.exports = {
    getAgent,
    listAgents,
    hasAgent,
    AGENT_REGISTRY
};
