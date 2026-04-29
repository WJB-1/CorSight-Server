/**
 * 防范式提示词库 - Language Optimizer Agent
 * 
 * 模块 4.1：提示词工程 - 语言重构防线
 * 
 * 本模块从 Markdown 文件加载提示词模板，支持热更新
 */

const {
    getLanguageOptimizerSystemPrompt,
    renderPrompt,
    extractSection
} = require('./promptLoader');

// LLM 调用参数配置
const LLM_PARAMETERS = {
    temperature: 0.1,  // 极低温度，确保输出稳定
    top_p: 0.85,       // 限制采样范围
    max_tokens: 800,   // 足够生成完整播报
    presence_penalty: 0,  // 不惩罚重复（某些关键词需要重复）
    frequency_penalty: 0  // 不惩罚频率
};

/**
 * 获取系统提示词（System Prompt）
 * 从 Markdown 文件加载
 * 
 * @returns {string} 系统提示词
 */
function getSystemPrompt() {
    return getLanguageOptimizerSystemPrompt();
}

/**
 * 获取用户提示词（User Prompt）
 * 将 IR JSON 数据格式化为 LLM 可理解的输入
 * 
 * @param {Object} irData - Phase 3 生成的中间表示数据
 * @returns {string} 用户提示词
 */
function getUserPrompt(irData) {
    if (!irData || !irData.key_nodes) {
        return '错误：缺少路线数据';
    }

    const summary = irData.route_summary || {};
    const nodes = irData.key_nodes || [];

    // 构建节点数据摘要
    const nodesDescription = nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const hazards = node.hazards || node.perception_data?.hazards || [];

        return {
            index: node.node_index || index + 1,
            distance: node.distance_from_start,
            action: node.action,
            clock_direction: node.clock_direction,
            instruction: node.instruction,
            road: node.road,
            hazards: hazards,
            is_destination: isLast || node.action?.includes('到达')
        };
    });

    // 判断是否有最后50米盲区描述
    const hasLast50mInfo = nodes.some(n =>
        n.instruction?.includes('50米') ||
        n.action?.includes('盲区') ||
        n.perception_data?.final_approach
    );

    return `请解析以下这段路线提取数据，严格遵循你的核心原则，为其生成行前语音预览播报词。

【路线概要】
- 总距离：${summary.total_distance || '未知'}
- 预计时间：${summary.duration_estimate || '未知'}
- 关键节点数：${nodes.length}个
- 数据压缩率：${summary.compression_ratio || '0%'}

【关键节点序列】
${nodesDescription.map(n => `
节点 ${n.index}:
- 距离起点：${n.distance}
- 动作：${n.action}
- 时钟方位：${n.clock_direction}
- 指令：${n.instruction}
- 道路：${n.road || '未知道路'}
${n.hazards.length > 0 ? `- 风险点：${n.hazards.join('、')}` : ''}
${n.is_destination ? '- 【最后路段/目的地】' : ''}
`).join('\n')}

${hasLast50mInfo ? '【注意】数据中包含最后50米盲区信息，请务必在第三段重点描述。' : ''}

请严格按照系统指令中的三段式结构生成播报词：
1. 宏观全局概览（一句话总结）
2. 关键节点时序拆解（按顺序逐一播报，使用<距离>+<时钟方位>+<物理特征>句式）
3. 最后50米盲区策略（重点描述触觉引导）`;
}

/**
 * 获取 Few-Shot 示例提示词
 * 
 * @returns {Array} Few-Shot 示例数组
 */
function getFewShotExamples() {
    return [
        {
            role: 'user',
            content: `路线数据：
{
  "total_distance": "700m",
  "key_nodes": [
    {"distance": "100m", "action": "上天桥", "clock": "11点钟方向", "hazards": ["两段连续向上台阶"]},
    {"distance": "600m", "action": "横过路口", "clock": "12点钟方向", "hazards": ["无盲道", "机非混行"]},
    {"distance": "650m", "action": "到达终点", "clock": "2点钟方向", "hazards": ["无导航覆盖", "需沿墙寻路"]}
  ]
}`
        },
        {
            role: 'assistant',
            content: `全程700米，行程包含两处关键空间突变点与一段无导航覆盖盲区。

12点钟方向直行100米后，向11点钟方向登上天桥，需跨越两段连续向上台阶。

下桥后保持12点钟方向直行500米抵达路口，该路口无盲道铺设且存在机非混行。

穿越路口后，向2点钟方向切入小区内部。最后50米缺乏导航覆盖，需利用盲杖沿右侧实体砖墙直行寻路，到达终点。`
        }
    ];
}

/**
 * 获取完整的对话消息列表
 * 用于调用 LLM API
 * 
 * @param {Object} irData - IR 数据
 * @returns {Array} 消息列表
 */
function getChatMessages(irData) {
    const messages = [
        {
            role: 'system',
            content: getSystemPrompt()
        },
        ...getFewShotExamples(),
        {
            role: 'user',
            content: getUserPrompt(irData)
        }
    ];

    return messages;
}

/**
 * 获取 LLM 调用参数
 * 
 * @returns {Object} LLM 参数
 */
function getLLMParameters() {
    return { ...LLM_PARAMETERS };
}

/**
 * 后处理：清理 LLM 输出中的禁用词和 Markdown 格式
 *
 * @param {string} text - LLM 原始输出
 * @returns {string} 清理后的文本
 */
function sanitizeOutput(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;

    // 1. 去除 Markdown 格式标记（循环清理确保彻底）
    // 第一轮：去除结构化标记
    cleaned = cleaned
        // 去除分隔线 ---
        .replace(/^\s*[-]{3,}\s*$/gm, '')
        // 去除标题标记 (# ## ### 等)
        .replace(/^#{1,6}\s*/gm, '')
        // 去除数字列表标记 (1. 2. 等)
        .replace(/^\s*\d+\.\s*/gm, '')
        // 去除无序列表标记 (- * + 开头，包括带缩进的)
        .replace(/^\s*[-*+]\s*/gm, '')
        // 去除加粗标记 (**text**) - 直接去除所有 **
        .replace(/\*\*/g, '')
        // 去除斜体标记 (*text*) - 需要保留中间的文本
        .replace(/\*([^\*]+)\*/g, '$1')
        // 去除代码标记 (`text`)
        .replace(/`([^`]+)`/g, '$1')
        // 去除勾选符号
        .replace(/[✓✔☑✗✘☒]/g, '')
        // 去除链接标记 [text](url) -> text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // 去除剩余的方括号
        .replace(/[\[\]]/g, '')
        // 去除 HTML 标签
        .replace(/<[^>]+>/g, '');

    // 第二轮：去除可能残留的格式（重复执行确保完全清理）
    for (let i = 0; i < 3; i++) {
        cleaned = cleaned
            .replace(/\*\*/g, '')
            .replace(/\*([^\*]+)\*/g, '$1')
            .replace(/^\s*[-\*\+]\s*/gm, '');
    }

    // 2. 禁用词表（视觉词汇、废话问候等）
    const forbiddenPatterns = [
        // 视觉词汇
        /看[到见]?/g,
        /颜[色彩]/g,
        /红[色]?/g,
        /蓝[色]?/g,
        /绿[色]?/g,
        /黄[色]?/g,
        /漂亮/g,
        /美丽/g,
        /风景/g,
        /招牌/g,
        /标识/g,

        // 废话问候
        /^你好[，！]?/g,
        /^您好[，！]?/g,
        /祝您[一]?路平安/g,
        /请注意安全/g,
        /请注意脚下/g,
        /祝您旅途愉快/g,

        // 模糊方位
        /左前方/g,
        /右前方/g,
        /左后方/g,
        /右后方/g,
        /偏左/g,
        /偏右/g,
        /向[左右][转拐]/g,  // 纯转向词，不含时钟方位

        // 情感渲染
        /亲爱的/g,
        /请小心/g,
        /千万要注意/g,
        /哦[，！]?/g,
        /呢[，！]?/g,
        /呀[，！]?/g
    ];

    // 应用正则替换
    forbiddenPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    // 3. 清理多余空白和标点
    cleaned = cleaned
        .replace(/\n{3,}/g, '\n\n')        // 最多两个换行
        .replace(/[，,]{2,}/g, '，')      // 合并重复逗号
        .replace(/[！!]{2,}/g, '！')      // 合并重复感叹号
        .replace(/^\s+/gm, '')           // 去除行首空白
        .trim();

    return cleaned;
}

/**
 * 验证输出是否符合规范
 * 
 * @param {string} text - 清理后的文本
 * @returns {Object} 验证结果
 */
function validateOutput(text) {
    const checks = {
        hasClockDirection: /\d{1,2}点钟方向/.test(text),
        hasThreeParagraphs: text.split('\n\n').filter(p => p.trim()).length >= 3,
        noVisualWords: !/[颜色红蓝绿黄]|看到|看见/.test(text),
        noGreetings: !/^(你好|您好)/.test(text),
        properEnding: !/(祝您|请小心|注意安全)$/.test(text)
    };

    const passed = Object.values(checks).every(v => v === true);

    return {
        passed,
        checks,
        issues: Object.entries(checks)
            .filter(([_, v]) => v === false)
            .map(([k, _]) => k)
    };
}

module.exports = {
    // 核心提示词函数
    getSystemPrompt,
    getUserPrompt,
    getFewShotExamples,
    getChatMessages,
    getLLMParameters,

    // 后处理函数
    sanitizeOutput,
    validateOutput
};
