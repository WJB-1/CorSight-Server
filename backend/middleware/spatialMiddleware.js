/**
 * 空间逻辑降噪中间件
 *
 * 模块 3.2：核心算法层
 * 将高德地图返回的"视觉导航数据"降噪并转换为"盲人认知数据"
 *
 * 核心功能：
 * 1. 过滤 - 丢弃无意义的直行过渡路段，保留关键节点
 * 2. 方向映射 - 将中文绝对方位转换为角度
 * 3. 用户朝向计算 - 从 polyline 推断用户进入节点时的实际航向
 * 4. 直路采样 - 在长直路段中插入离散采样点
 *
 * @module spatialMiddleware
 */

/**
 * 中文绝对方位到角度的映射字典
 * 北=0°, 东北=45°, 东=90°, 东南=135°, 南=180°, 西南=225°, 西=270°, 西北=315°
 */
const ORIENTATION_ANGLE_MAP = {
    '北': 0,
    '东北': 45,
    '东': 90,
    '东南': 135,
    '南': 180,
    '西南': 225,
    '西': 270,
    '西北': 315,
    'N': 0,
    'NE': 45,
    'E': 90,
    'SE': 135,
    'S': 180,
    'SW': 225,
    'W': 270,
    'NW': 315
};

/**
 * 特殊 walk_type 值（关键节点）
 * 参考高德步行路径规划 API 文档
 */
const SPECIAL_WALK_TYPES = [1, 3, 4, 8, 9, 12, 13, 20, 21, 22, 23];

/**
 * 转向 action 值（关键节点）
 */
const TURN_ACTIONS = ['左转', '右转', '向左前方', '向右前方', '向左后方', '向右后方', '调头', '掉头', '到道路斜对面'];

/**
 * 过马路 action 值（关键节点）
 */
const CROSSING_ACTIONS = ['通过人行横道', '通过过街天桥', '通过地下通道', '通过广场', '到道路斜对面'];

/**
 * 辅助动作中标识终点的值
 */
const DESTINATION_ASSISTANT_ACTIONS = ['到达目的地'];

/**
 * 纯直行/过渡 action 值（非关键节点）
 */
const STRAIGHT_ACTIONS = ['无基本导航动作', '直行', '靠左', '靠右'];

/**
 * instruction 文本兜底关键词（保留作为 fallback）
 */
const KEY_ACTION_KEYWORDS = [
    '左转', '右转', '左前方', '右前方', '左后方', '右后方', '调头', '掉头',
    '天桥', '地下通道', '通道', '隧道', '扶梯', '电梯', '楼梯',
    '斑马线', '人行横道', '过街', '进入', '离开', '到达'
];

/**
 * 将中文绝对方位转换为角度
 *
 * @param {string} orientation - 中文方位（如"东"、"东南"）
 * @returns {number|null} 对应的角度，未识别返回 null
 */
function orientationToAngle(orientation) {
    if (!orientation || typeof orientation !== 'string') return null;
    const cleaned = orientation.trim().replace(/[方向]/g, '');
    if (ORIENTATION_ANGLE_MAP.hasOwnProperty(cleaned)) {
        return ORIENTATION_ANGLE_MAP[cleaned];
    }
    for (const [key, angle] of Object.entries(ORIENTATION_ANGLE_MAP)) {
        if (cleaned.includes(key)) return angle;
    }
    return null;
}

/**
 * 判断是否为需要保留的关键节点
 *
 * 优先级：walk_type > action > assistant_action > instruction 文本兜底
 *
 * @param {Object} step - 高德返回的 step 对象
 * @returns {boolean} 是否是关键节点
 */
function isKeyNode(step) {
    if (!step) return false;

    // 1. 优先使用 walk_type（最可靠的结构化标识）
    const walkType = parseInt(step.walk_type, 10);
    if (!isNaN(walkType) && SPECIAL_WALK_TYPES.includes(walkType)) {
        return true;
    }

    // 2. 使用 action 判断转向和过马路
    const action = step.action || '';
    if (TURN_ACTIONS.includes(action) || CROSSING_ACTIONS.includes(action)) {
        return true;
    }

    // 3. 辅助动作判断终点
    const assistantAction = step.assistant_action || '';
    if (DESTINATION_ASSISTANT_ACTIONS.includes(assistantAction)) {
        return true;
    }

    // 4. 纯直行/过渡动作明确不是关键节点
    if (STRAIGHT_ACTIONS.includes(action)) {
        return false;
    }

    // 5. 兜底：检查 instruction 文本中的特殊地形关键词
    const instruction = step.instruction || '';
    const text = `${action} ${instruction}`.toLowerCase();
    for (const keyword of KEY_ACTION_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) return true;
    }

    // 6. 检查 road 是否包含特殊标志物
    const road = step.road || '';
    const specialRoads = ['天桥', '地下通道', '隧道', '立交', '环岛', '广场'];
    for (const special of specialRoads) {
        if (road.includes(special)) return true;
    }

    return false;
}

/**
 * 判断是否为纯直行/过渡路段（用于直路采样）
 *
 * @param {Object} step - 高德返回的 step 对象
 * @returns {boolean} 是否是直路
 */
function isStraightSegment(step) {
    if (!step) return false;

    const walkType = parseInt(step.walk_type, 10);
    const action = step.action || '';

    // walk_type=0 普通道路 + 直行类 action
    return (walkType === 0 || isNaN(walkType)) &&
           (STRAIGHT_ACTIONS.includes(action) || action === '');
}

/**
 * 从 polyline 计算用户航向角（进入该路段时的方向）
 *
 * @param {string} polyline - "lng,lat;lng,lat;..."
 * @returns {number|null} 航向角（0-360°，北为0°）
 */
function calculateHeadingFromPolyline(polyline) {
    if (!polyline) return null;
    const coords = parsePolyline(polyline);
    if (coords.length < 2) return null;

    // 取 polyline 的前两个点计算进入方向
    const start = coords[0];
    const next = coords[1];
    return calculateBearing(start, next);
}

/**
 * 计算两点间的方位角
 *
 * @param {Object} from - { lat, lng }
 * @param {Object} to - { lat, lng }
 * @returns {number} 方位角 0-360°
 */
function calculateBearing(from, to) {
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLng = toRadians(to.lng - from.lng);

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = toDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function toRadians(deg) { return deg * Math.PI / 180; }
function toDegrees(rad) { return rad * 180 / Math.PI; }

/**
 * 将角度转换为8方向字符串
 *
 * @param {number} angle - 0-360°
 * @returns {string} N/NE/E/SE/S/SW/W/NW
 */
function angleToDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(angle / 45) % 8;
    return directions[index];
}

/**
 * 解析高德 polyline 字符串
 *
 * @param {string} polyline - 格式: "lng,lat;lng,lat;..."
 * @returns {Array} 坐标数组 { lat, lng }
 */
function parsePolyline(polyline) {
    if (!polyline || typeof polyline !== 'string') return [];
    try {
        return polyline.split(';').map(point => {
            const [lng, lat] = point.split(',').map(Number);
            return { lat, lng };
        }).filter(coord => !isNaN(coord.lat) && !isNaN(coord.lng));
    } catch (e) {
        return [];
    }
}

/**
 * 格式化距离显示
 *
 * @param {number|string} distance - 距离（米）
 * @returns {string} 格式化后的距离
 */
function formatDistance(distance) {
    const dist = parseInt(distance, 10);
    if (isNaN(dist)) return '未知距离';
    if (dist < 1000) return `${dist}米`;
    return `${(dist / 1000).toFixed(1)}公里`;
}

/**
 * 格式化时间显示
 *
 * @param {number|string} duration - 时间（秒）
 * @returns {string} 格式化后的时间
 */
function formatDuration(duration) {
    const seconds = parseInt(duration, 10);
    if (isNaN(seconds)) return '未知时间';
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remaining = seconds % 60;
        return remaining > 0 ? `${minutes}分${remaining}秒` : `${minutes}分钟`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
}

/**
 * 创建节点对象
 *
 * @param {Object} step - 原始 step
 * @param {number} accumulatedDistance - 累积距离（米）
 * @param {string} nodeType - 'key' | 'sample'
 * @param {number} index - 节点序号
 * @param {Object} prevNode - 上一个节点（用于计算相对方向）
 * @returns {Object} 节点对象
 */
function createNode(step, accumulatedDistance, nodeType, index, prevNode = null) {
    // 计算用户朝向
    const heading = calculateHeadingFromPolyline(step.polyline);
    const headingDir = heading !== null ? angleToDirection(heading) : null;

    // 计算相对方向（基于前一节点的朝向变化）
    let relativeDirection = null;
    if (prevNode && prevNode.heading !== null && heading !== null) {
        const delta = (heading - prevNode.heading + 360) % 360;
        if (delta < 30 || delta > 330) relativeDirection = '直行';
        else if (delta >= 30 && delta < 60) relativeDirection = '稍向左转';
        else if (delta >= 60 && delta < 120) relativeDirection = '左转';
        else if (delta >= 120 && delta < 150) relativeDirection = '向左后方转';
        else if (delta >= 150 && delta < 210) relativeDirection = '掉头';
        else if (delta >= 210 && delta < 240) relativeDirection = '向右后方转';
        else if (delta >= 240 && delta < 300) relativeDirection = '右转';
        else if (delta >= 300 && delta < 330) relativeDirection = '稍向右转';
    }

    const node = {
        node_index: index,
        node_type: nodeType,
        distance_from_start: formatDistance(accumulatedDistance),
        action: step.action || '直行',
        assistant_action: step.assistant_action || '',
        instruction: step.instruction || '',
        road: step.road || '',
        distance: formatDistance(step.distance),
        orientation: step.orientation || '未知',
        heading: heading,
        heading_direction: headingDir,
        relative_direction: relativeDirection,
        walk_type: step.walk_type !== undefined ? parseInt(step.walk_type, 10) : null,
        polyline: step.polyline || ''
    };

    return node;
}

/**
 * 生成中间表示 (Intermediate Representation, IR)
 *
 * 核心算法流程：
 * 1. 过滤关键节点（isKeyNode）
 * 2. 在长直路段中插入采样点（每150-200米）
 * 3. 计算用户朝向和相对方向
 * 4. 组装 IR JSON
 *
 * @param {Object} pathData - 高德返回的路径数据 (route.paths[0])
 * @returns {Object} 中间表示 JSON
 */
function generateIntermediateRepresentation(pathData) {
    if (!pathData || !pathData.steps || !Array.isArray(pathData.steps)) {
        throw new Error('路径数据格式错误，缺少 steps 数组');
    }

    console.log(`[spatialMiddleware] 开始处理路径，原始节点数: ${pathData.steps.length}`);

    const allNodes = [];
    let accumulatedDistance = 0;
    let lastSampleDistance = 0;
    let nodeIndex = 0;
    let prevNode = null;

    for (let i = 0; i < pathData.steps.length; i++) {
        const step = pathData.steps[i];
        const stepDistance = parseInt(step.distance, 10) || 0;
        accumulatedDistance += stepDistance;

        const isKey = isKeyNode(step);
        const isStraight = isStraightSegment(step);

        if (isKey) {
            // 关键节点直接加入
            nodeIndex++;
            const node = createNode(step, accumulatedDistance, 'key', nodeIndex, prevNode);
            allNodes.push(node);
            prevNode = node;
            lastSampleDistance = accumulatedDistance;
        } else if (isStraight && (accumulatedDistance - lastSampleDistance >= 200)) {
            // 直路段：距离上一个采样点超过200米时插入采样点
            nodeIndex++;
            const node = createNode(step, accumulatedDistance, 'sample', nodeIndex, prevNode);
            allNodes.push(node);
            prevNode = node;
            lastSampleDistance = accumulatedDistance;
        }
        // 非关键非直路（如短过渡段）直接跳过
    }

    // 保底策略：如果没有节点，保留第一个和最后一个
    if (allNodes.length === 0 && pathData.steps.length > 0) {
        const firstStep = pathData.steps[0];
        const lastStep = pathData.steps[pathData.steps.length - 1];

        const firstNode = createNode(firstStep, parseInt(firstStep.distance, 10) || 0, 'key', 1, null);
        allNodes.push(firstNode);

        if (pathData.steps.length > 1) {
            const totalDist = parseInt(pathData.distance, 10) || 0;
            const lastNode = createNode(lastStep, totalDist, 'key', 2, firstNode);
            allNodes.push(lastNode);
        }
    }

    // 确保最后一个原始 step 被包含（如果是目的地）
    const lastStep = pathData.steps[pathData.steps.length - 1];
    const hasDestination = allNodes.some(n =>
        n.assistant_action === '到达目的地' ||
        n.action === '到达' ||
        n.action === '到达目的地'
    );
    if (!hasDestination && lastStep) {
        nodeIndex++;
        const totalDist = parseInt(pathData.distance, 10) || 0;
        const destNode = createNode(lastStep, totalDist, 'key', nodeIndex, prevNode);
        allNodes.push(destNode);
    }

    const keyNodes = allNodes.filter(n => n.node_type === 'key');
    const sampleNodes = allNodes.filter(n => n.node_type === 'sample');

    const intermediateRepresentation = {
        route_summary: {
            total_distance: formatDistance(pathData.distance),
            duration_estimate: formatDuration(pathData.duration),
            original_steps_count: pathData.steps.length,
            key_nodes_count: keyNodes.length,
            sample_nodes_count: sampleNodes.length,
            total_nodes_count: allNodes.length,
            compression_ratio: `${((1 - allNodes.length / pathData.steps.length) * 100).toFixed(1)}%`
        },
        key_nodes: allNodes, // 包含 key + sample，下游按 node_type 区分
        raw_data: {
            tolls: pathData.tolls || 0,
            toll_distance: pathData.toll_distance || 0,
            restriction: pathData.restriction || 0
        }
    };

    console.log(`[spatialMiddleware] IR 生成完成，关键节点: ${keyNodes.length}, 采样节点: ${sampleNodes.length}, 压缩率: ${intermediateRepresentation.route_summary.compression_ratio}`);

    return intermediateRepresentation;
}

/**
 * 测试中间件功能
 *
 * @returns {Object} 测试结果
 */
function testMiddleware() {
    const testCases = [
        // walk_type 测试
        { step: { walk_type: 4, action: '直行', instruction: '继续直行' }, expected: true, desc: 'walk_type=4(天桥)' },
        { step: { walk_type: 0, action: '直行', instruction: '继续直行' }, expected: false, desc: 'walk_type=0+直行' },
        { step: { walk_type: 1, action: '通过人行横道', instruction: '' }, expected: true, desc: 'walk_type=1(人行横道)' },
        // action 测试
        { step: { walk_type: 0, action: '左转', instruction: '向左转' }, expected: true, desc: 'action=左转' },
        { step: { walk_type: 0, action: '无基本导航动作', instruction: '沿道路直行' }, expected: false, desc: 'action=无基本导航动作' },
        // assistant_action 测试
        { step: { walk_type: 0, action: '直行', assistant_action: '到达目的地', instruction: '' }, expected: true, desc: 'assistant_action=到达目的地' },
        // 兜底测试
        { step: { walk_type: 0, action: '', instruction: '前方有过街天桥' }, expected: true, desc: 'instruction含天桥' },
    ];

    const results = testCases.map(tc => {
        const result = isKeyNode(tc.step);
        return {
            ...tc,
            actual: result,
            pass: result === tc.expected
        };
    });

    const allPass = results.every(r => r.pass);

    return {
        success: allPass,
        results
    };
}

module.exports = {
    generateIntermediateRepresentation,
    orientationToAngle,
    isKeyNode,
    isStraightSegment,
    calculateHeadingFromPolyline,
    calculateBearing,
    angleToDirection,
    parsePolyline,
    createNode,
    testMiddleware,
    ORIENTATION_ANGLE_MAP
};
