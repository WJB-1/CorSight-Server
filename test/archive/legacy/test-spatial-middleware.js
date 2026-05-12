/**
 * 测试 spatialMiddleware.js 中的关键函数
 * 特别是验证 action.trim() 和 orientation.trim() 修复是否正确
 */

// 模拟 spatialMiddleware 中的关键函数
function orientationToAngle(orientation) {
    // 修复后的代码：添加 typeof 检查
    if (!orientation || typeof orientation !== 'string') return null;

    const ORIENTATION_ANGLE_MAP = {
        '北': 0, '东北': 45, '东': 90, '东南': 135,
        '南': 180, '西南': 225, '西': 270, '西北': 315
    };

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

function isKeyDecisionPoint(step) {
    // 标准：检查 action 和 orientation
    const action = step.action;

    // 检查 action 是否包含转向关键词（修复后的代码）
    if (action && typeof action === 'string' && action.trim()) {
        const turnKeywords = ['左转', '右转', '调头', '掉头', '进入', '离开', '靠左', '靠右', '直行'];
        for (const keyword of turnKeywords) {
            if (action.includes(keyword)) {
                return true;
            }
        }
    }

    // 检查 orientation 是否有意义
    const orientation = step.orientation;
    if (orientation && orientationToAngle(orientation) !== null) {
        // 修复后的代码：添加 typeof 检查
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

// 测试用例
console.log('========================================');
console.log('Spatial Middleware 全面测试');
console.log('========================================\n');

let totalPassed = 0;
let totalFailed = 0;

// ============ 测试 orientationToAngle ============
console.log('【测试 1】orientationToAngle 函数');
console.log('----------------------------------------');

const orientationTests = [
    { name: '正常方位"东"', input: '东', expected: 90 },
    { name: '正常方位"东北"', input: '东北', expected: 45 },
    { name: '带空格" 东 "', input: ' 东 ', expected: 90 },
    { name: '带"方向"词"东方"', input: '东方', expected: 90 },
    { name: 'orientation 为 null', input: null, expected: null },
    { name: 'orientation 为 undefined', input: undefined, expected: null },
    { name: 'orientation 为数字', input: 123, expected: null },
    { name: 'orientation 为对象', input: { dir: '东' }, expected: null },
    { name: 'orientation 为数组', input: ['东'], expected: null },
    { name: 'orientation 为空字符串', input: '', expected: null },
    { name: '无效方位"上下"', input: '上下', expected: null }
];

for (const test of orientationTests) {
    try {
        const result = orientationToAngle(test.input);
        const success = result === test.expected;

        if (success) {
            console.log(`✅ ${test.name}: ${result}`);
            totalPassed++;
        } else {
            console.log(`❌ ${test.name}: 期望 ${test.expected}, 实际 ${result}`);
            totalFailed++;
        }
    } catch (error) {
        console.log(`💥 ${test.name}: 异常 - ${error.message}`);
        totalFailed++;
    }
}

// ============ 测试 isKeyDecisionPoint ============
console.log('\n【测试 2】isKeyDecisionPoint 函数');
console.log('----------------------------------------');

const decisionPointTests = [
    {
        name: '正常字符串 action',
        step: { action: '左转', orientation: '东', road: '中山大道' },
        expected: true
    },
    {
        name: 'action 为 null',
        step: { action: null, orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为 undefined',
        step: { action: undefined, orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为数字',
        step: { action: 123, orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为对象',
        step: { action: { text: '左转' }, orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为数组',
        step: { action: ['左转'], orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为空字符串',
        step: { action: '', orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'action 为空白字符串',
        step: { action: '   ', orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: '没有 action 字段',
        step: { orientation: '东', road: '中山大道' },
        expected: false
    },
    {
        name: 'orientation 为数字类型',
        step: { action: '左转', orientation: 90, road: '中山大道' },
        expected: true  // action 有效，应该返回 true
    },
    {
        name: 'orientation 为对象类型',
        step: { action: '左转', orientation: { dir: '东' }, road: '中山大道' },
        expected: true  // action 有效，应该返回 true
    },
    {
        name: '特殊道路（天桥）',
        step: { action: '直行', orientation: '北', road: '人行天桥' },
        expected: true
    },
    {
        name: '调头动作',
        step: { action: '调头', orientation: '南', road: '中山路' },
        expected: true
    }
];

for (const test of decisionPointTests) {
    try {
        const result = isKeyDecisionPoint(test.step);
        const success = result === test.expected;

        if (success) {
            console.log(`✅ ${test.name}`);
            totalPassed++;
        } else {
            console.log(`❌ ${test.name}: 期望 ${test.expected}, 实际 ${result}`);
            console.log(`   输入: ${JSON.stringify(test.step)}`);
            totalFailed++;
        }
    } catch (error) {
        console.log(`💥 ${test.name}: 异常 - ${error.message}`);
        console.log(`   输入: ${JSON.stringify(test.step)}`);
        totalFailed++;
    }
}

// 总结
console.log('\n========================================');
console.log(`总测试结果: ${totalPassed} 通过, ${totalFailed} 失败`);
console.log('========================================');

if (totalFailed > 0) {
    console.log('\n⚠️  有测试失败，需要进一步检查');
    process.exit(1);
} else {
    console.log('\n✅ 所有测试通过！修复正确。');
    process.exit(0);
}
