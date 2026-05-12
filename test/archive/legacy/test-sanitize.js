/**
 * 测试 Markdown 清理函数
 */

const { sanitizeOutput } = require('../backend/prompts/defensivePrompts');

// 测试用例
const testCases = [
    {
        name: '粗体标记',
        input: '**全程导航指引**（总距离700米）',
        expected: '全程导航指引（总距离700米）'
    },
    {
        name: '分隔线',
        input: '第一段内容\n\n---\n\n第二段内容',
        expected: '第一段内容\n\n第二段内容'
    },
    {
        name: '无序列表',
        input: '- 方向：12点钟方向\n- 距离：100米',
        expected: '方向：12点钟方向\n距离：100米'
    },
    {
        name: '数字列表',
        input: '1. 第一步\n2. 第二步',
        expected: '第一步\n第二步'
    },
    {
        name: '标题标记',
        input: '### 第一段：起点→天桥入口',
        expected: '第一段：起点→天桥入口'
    },
    {
        name: '复杂嵌套',
        input: '**关键空间突变点1**：当盲杖前端触碰到**第一级台阶**边缘时',
        expected: '关键空间突变点1：当盲杖前端触碰到第一级台阶边缘时'
    },
    {
        name: '带缩进的列表',
        input: '  - 导航方式：沿12点钟方向\n  - 盲杖技巧：两点钟触地法',
        expected: '导航方式：沿12点钟方向\n盲杖技巧：两点钟触地法'
    },
    {
        name: '斜体',
        input: '盲杖技巧：*两点钟触地法*',
        expected: '盲杖技巧：两点钟触地法'
    }
];

console.log('🧪 测试 Markdown 清理函数\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
    const result = sanitizeOutput(test.input);
    const isPass = result === test.expected;

    console.log(`\n测试 ${index + 1}: ${test.name}`);
    console.log(`输入: ${JSON.stringify(test.input)}`);
    console.log(`期望: ${JSON.stringify(test.expected)}`);
    console.log(`实际: ${JSON.stringify(result)}`);
    console.log(`结果: ${isPass ? '✅ 通过' : '❌ 失败'}`);

    if (isPass) {
        passed++;
    } else {
        failed++;
    }
});

console.log(`\n\n📊 测试结果: ${passed}/${testCases.length} 通过`);

// 测试真实 LLM 输出
console.log('\n\n📝 测试真实 LLM 输出示例:');
const realOutput = `**全程导航指引（总距离700米，预计用时12-15分钟）**

**起点准备阶段：**

请面向正前方，确保盲杖垂直于地面展开。确认当前环境无遮挡物后，准备出发。

---

**第一段：直行与天桥入口（0-100米）**

- **方向**：12点钟方向（正前方）

- **距离**：直行约100步（约100米）`;

console.log('原始输出:');
console.log(realOutput);
console.log('\n清理后:');
console.log(sanitizeOutput(realOutput));
