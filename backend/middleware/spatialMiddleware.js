/**
 * 空间逻辑降噪中间件
 * 
 * 模块 3.2：核心算法层
 * 将高德地图返回的"视觉导航数据"降噪并转换为"盲人认知数据"
 * 
 * 核心功能：
 * 1. 过滤 - 丢弃无意义的直行过渡路段，保留关键节点
 * 2. 方向映射 - 将中文绝对方位转换为角度
 * 3. 时钟方位计算 - 将绝对方位差转换为相对时钟方向
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
    // 兼容英文和简写
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
 * 关键动作关键词字典
 * 用于识别需要保留的关键节点
 */
const KEY_ACTION_KEYWORDS = [
    // 转向动作
    '左转',
    '右转',
    '左前方',
    '右前方',
    '左后方',
    '右后方',
    '调头',
    '掉头',
    // 特殊地形
    '天桥',
    '地下通道',
    '通道',
    '隧道',
    '扶梯',
    '电梯',
    '楼梯',
    // 过马路
    '斑马线',
    '人行横道',
    '过街',
    // 明显标志物
    '进入',
    '离开',
    '到达'
];

/**
 * 纯直行关键词（用于过滤）
 */
const STRAIGHT_KEYWORDS = [
    '直行',
    '靠左',
    '靠右',
    '沿',
    '向'
];

/**
 * 将中文绝对方位转换为角度
 * 
 * @param {string} orientation - 中文方位（如"东"、"东南"）
 * @returns {number|null} 对应的角度，未识别返回 null
 */
function orientationToAngle(orientation) {
    if (!orientation || typeof orientation !== 'string') return null;

    // 清理字符串，移除空格和方向符号
    const cleaned = orientation.trim().replace(/[方向]/g, '');

    // 直接匹配
    if (ORIENTATION_ANGLE_MAP.hasOwnProperty(cleaned)) {
        return ORIENTATION_ANGLE_MAP[cleaned];
    }

    // 尝试部分匹配（如"向东"中提取"东"）
    for (const [key, angle] of Object.entries(ORIENTATION_ANGLE_MAP)) {
        if (cleaned.includes(key)) {
            return angle;
        }
    }

    return null;
}

/**
 * 判断是否为需要保留的关键节点
 * 
 * @param {Object} step - 高德返回的 step 对象
 * @returns {boolean} 是否是关键节点
 */
function isKeyNode(step) {
    if (!step) return false;

    const action = step.action || '';
    const instruction = step.instruction || '';
    const text = `${action} ${instruction}`.toLowerCase();

    // 检查是否包含关键动作关键词
    for (const keyword of KEY_ACTION_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) {
            return true;
        }
    }

    // 检查 orientation 是否有意义
    const orientation = step.orientation;
    if (orientation && orientationToAngle(orientation) !== null) {
        // 如果有明确的方位且不是纯直行，可能是关键节点
        // 但如果没有 action，可能是过渡路段
        if (action && typeof action === 'string' && action.trim()) {
            return true;
        }
    }

    // 检查 road 是否包含特殊标志物
    const road = step.road || '';
    const specialRoads = ['天桥', '地下通道', '隧道', '立交', '环岛', '广场'];
    for (const special of specialRoads) {
        if (road.includes(special)) {
            return true;
        }
    }

    return false;
}

/**
 * 计算相对时钟方向
 * 
 * 算法：
 * 1. 上一节点绝对方位角 θ_prev
 * 2. 当前节点绝对方位角 θ_curr
 * 3. 相对转向角度差值：Δθ = (θ_curr - θ_prev + 360) % 360
 * 4. 映射到 12 时辰：clockFace = round(Δθ / 30)
 * 5. 若 clockFace === 0，则强制设为 12
 * 
 * @param {number} prevAngle - 上一节点的绝对方位角
 * @param {number} currAngle - 当前节点的绝对方位角
 * @returns {string} 时钟方向描述（如"3点钟方向"）
 */
function calculateClockDirection(prevAngle, currAngle) {
    // 计算相对转向角度差值
    let deltaTheta = (currAngle - prevAngle + 360) % 360;

    // 映射到 12 时辰
    let clockFace = Math.round(deltaTheta / 30);

    // 若 clockFace === 0，则强制设为 12（正前方）
    if (clockFace === 0) {
        clockFace = 12;
    }

    return `${clockFace}点钟方向`;
}

/**
 * 格式化距离显示
 * 
 * @param {number|string} distance - 距离（米）
 * @returns {string} 格式化后的距离（如"150米"或"1.2公里"）
 */
function formatDistance(distance) {
    const dist = parseInt(distance, 10);
    if (isNaN(dist)) return '未知距离';

    if (dist < 1000) {
        return `${dist}米`;
    } else {
        return `${(dist / 1000).toFixed(1)}公里`;
    }
}

/**
 * 格式化时间显示
 * 
 * @param {number|string} duration - 时间（秒）
 * @returns {string} 格式化后的时间（如"2分钟"或"1小时5分钟"）
 */
function formatDuration(duration) {
    const seconds = parseInt(duration, 10);
    if (isNaN(seconds)) return '未知时间';

    if (seconds < 60) {
        return `${seconds}秒`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remaining = seconds % 60;
        if (remaining > 0) {
            return `${minutes}分${remaining}秒`;
        }
        return `${minutes}分钟`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (minutes > 0) {
            return `${hours}小时${minutes}分钟`;
        }
        return `${hours}小时`;
    }
}

/**
 * 生成中间表示 (Intermediate Representation, IR)
 * 
 * 核心算法流程：
 * 1. 过滤：遍历 steps，仅保留关键节点
 * 2. 方向映射：将 orientation 转换为角度
 * 3. 时钟方位计算：计算相对时钟方向
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

    // 步骤 1: 过滤关键节点
    const keySteps = pathData.steps.filter(isKeyNode);
    console.log(`[spatialMiddleware] 过滤后关键节点数: ${keySteps.length}`);

    // 步骤 2 & 3: 处理每个关键节点，计算时钟方位
    const keyNodes = [];
    let accumulatedDistance = 0;
    let prevAngle = null;

    for (let i = 0; i < keySteps.length; i++) {
        const step = keySteps[i];

        // 累加距离
        const stepDistance = parseInt(step.distance, 10) || 0;
        accumulatedDistance += stepDistance;

        // 获取当前方位角
        const currAngle = orientationToAngle(step.orientation);

        // 计算时钟方向
        let clockDirection = null;
        if (prevAngle !== null && currAngle !== null) {
            clockDirection = calculateClockDirection(prevAngle, currAngle);
        } else if (i === 0) {
            // 第一个节点，使用绝对方位作为参考
            clockDirection = currAngle !== null ? `${Math.round(currAngle / 30) || 12}点钟方向（绝对方位）` : '正前方';
        }

        // 构建节点信息
        const node = {
            node_index: i + 1,
            distance_from_start: formatDistance(accumulatedDistance),
            action: step.action || '直行',
            clock_direction: clockDirection || '正前方',
            instruction: step.instruction || '',
            road: step.road || '',
            distance: formatDistance(step.distance),
            orientation: step.orientation || '未知',
            polyline: step.polyline || ''
        };

        keyNodes.push(node);

        // 更新上一节点角度
        if (currAngle !== null) {
            prevAngle = currAngle;
        }
    }

    // 如果没有关键节点，保留第一个和最后一个作为保底
    if (keyNodes.length === 0 && pathData.steps.length > 0) {
        const firstStep = pathData.steps[0];
        const lastStep = pathData.steps[pathData.steps.length - 1];

        keyNodes.push({
            node_index: 1,
            distance_from_start: formatDistance(firstStep.distance),
            action: '出发',
            clock_direction: '正前方',
            instruction: firstStep.instruction || '开始步行',
            road: firstStep.road || '',
            distance: formatDistance(firstStep.distance),
            orientation: firstStep.orientation || '未知'
        });

        if (pathData.steps.length > 1) {
            const totalDist = parseInt(pathData.distance, 10) || 0;
            keyNodes.push({
                node_index: 2,
                distance_from_start: formatDistance(totalDist),
                action: '到达',
                clock_direction: '目的地',
                instruction: lastStep.instruction || '到达目的地',
                road: lastStep.road || '',
                distance: formatDistance(lastStep.distance),
                orientation: lastStep.orientation || '未知'
            });
        }
    }

    // 组装 IR JSON
    const intermediateRepresentation = {
        route_summary: {
            total_distance: formatDistance(pathData.distance),
            duration_estimate: formatDuration(pathData.duration),
            original_steps_count: pathData.steps.length,
            filtered_nodes_count: keyNodes.length,
            compression_ratio: `${((1 - keyNodes.length / pathData.steps.length) * 100).toFixed(1)}%`
        },
        key_nodes: keyNodes,
        raw_data: {
            tolls: pathData.tolls || 0,
            toll_distance: pathData.toll_distance || 0,
            restriction: pathData.restriction || 0
        }
    };

    console.log(`[spatialMiddleware] IR 生成完成，压缩率: ${intermediateRepresentation.route_summary.compression_ratio}`);

    return intermediateRepresentation;
}

/**
 * 测试中间件功能
 * 
 * @returns {Object} 测试结果
 */
function testMiddleware() {
    const testCases = [
        { prev: 0, curr: 90, expected: '3点钟方向' },    // 北 -> 东
        { prev: 0, curr: 180, expected: '6点钟方向' },   // 北 -> 南（向后）
        { prev: 90, curr: 135, expected: '2点钟方向' },  // 东 -> 东南
        { prev: 270, curr: 0, expected: '3点钟方向' },   // 西 -> 北
    ];

    const results = testCases.map(tc => {
        const result = calculateClockDirection(tc.prev, tc.curr);
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
    calculateClockDirection,
    isKeyNode,
    testMiddleware,
    // 导出常量供测试使用
    ORIENTATION_ANGLE_MAP,
    KEY_ACTION_KEYWORDS
};
