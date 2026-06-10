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

const { generateEnhancedPrompt } = require('../agents/masterAgent');

// LLM 调用参数配置
const LLM_PARAMETERS = {
    temperature: 0.1,  // 极低温度，确保输出稳定
    top_p: 0.85,       // 限制采样范围
    max_tokens: 800,   // 足够生成完整播报
    presence_penalty: 0,
    frequency_penalty: 0
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

    // 清洗工具：移除文本中的绝对方位词
    const stripCardinalDirections = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
            .replace(/向?(东北|东南|西北|西南|正东|正西|正南|正北|东|西|南|北)(方向)?/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // 构建节点数据摘要（清洗后的数据，避免方位词污染）
    const nodesDescription = nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const hazards = node.hazards || node.perception_data?.hazards || [];

        // relative_direction 优先，否则才用 action 中的方向；移除空数组
        let action = Array.isArray(node.action) ? '' : (node.action || '');
        let direction = node.relative_direction;
        if (!direction || direction === '直行') {
            direction = '直行';
        }
        const cleanedInstruction = stripCardinalDirections(node.instruction);

        return {
            index: node.node_index || index + 1,
            distance: node.distance_from_start,
            action: stripCardinalDirections(action),
            relative_direction: direction,
            instruction: cleanedInstruction,
            road: Array.isArray(node.road) ? '' : (node.road || ''),
            hazards: hazards,
            has_perception: !!node.perception_data,
            visual_summary: node.visual_summary || '',
            is_destination: isLast || (typeof node.action === 'string' && node.action.includes('到达')) || node.assistant_action === '到达目的地'
        };
    });

    // 统计实际风险点（避免 LLM 凭空捏造）
    const totalHazards = nodesDescription.reduce((sum, n) => sum + (n.hazards.length), 0);
    const hasLast50mInfo = nodes.some(n =>
        (n.instruction && typeof n.instruction === 'string' && n.instruction.includes('50米')) ||
        (n.action && typeof n.action === 'string' && n.action.includes('盲区')) ||
        n.perception_data?.final_approach
    );

    // 生成全局分析段落
    const globalSection = generateEnhancedPrompt(irData);

    return `${globalSection}
【路线概要】
- 总距离：${summary.total_distance || '未知'}
- 预计时间：${summary.duration_estimate || '未知'}
- 关键节点数：${nodes.length}个
- 数据中标注的风险点总数：${totalHazards}个

【关键节点序列】
${nodesDescription.map(n => `
节点 ${n.index}:
- 距离起点：${n.distance}
- 转向：${n.relative_direction}
- 动作：${n.action || '前行'}
- 道路：${n.road || '未命名道路'}
${n.hazards.length > 0 ? `- 风险点：${n.hazards.join('、')}` : '- 风险点：无（请勿凭空添加）'}
${n.visual_summary ? `- 视觉感知：${n.visual_summary}` : ''}
${n.is_destination ? '- 【终点节点】' : ''}
`).join('\n')}

${hasLast50mInfo ? '【最后50米】数据中包含盲区信息，请重点描述。' : '【最后50米】数据未标注特殊盲区，但仍需提示用户在终点附近使用盲杖追踪墙面/路缘。'}

【硬性要求】
1. 必须使用上方真实数据中的距离、节点数、道路名称
2. 严禁使用东、西、南、北、东南、西北等绝对方位词；只用 左转、右转、直行、稍向左转、稍向右转
3. 【安全警告】若每个节点的风险点都标记为"无"，则文案中绝对不能出现"天桥、地下通道、红绿灯、盲道、台阶"等词。虚构的设施会误导视障用户，造成安全事故
4. 若数据中风险点总数为0，则段1只说总距离，不要说"X个关键风险点"
5. 输出必须用 [SEG] 标记分隔三个段落。格式：段1内容[SEG]段2内容[SEG]段3内容
6. 不要在结尾留省略号或半句话；必须完整结束`;
}

/**
 * 获取 Few-Shot 示例提示词
 *
 * 注意：在 DeepSeek V4 thinking 模式下，Few-Shot 示例会被复读
 * 因此返回空数组，示例风格已在 system prompt 中描述
 *
 * @returns {Array} 空数组
 */
function getFewShotExamples() {
    return [];
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
 * 后处理：清理 LLM 输出中的禁用词和多余格式
 *
 * @param {string} text - LLM 原始输出
 * @returns {string} 清理后的文本
 */
function sanitizeOutput(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleaned = text;

    // 0. 段落恢复：优先处理 [SEG] 显式分段标记（必须在去方括号之前执行）
    if (cleaned.includes('[SEG]')) {
        cleaned = cleaned.split('[SEG]').map(s => s.trim()).filter(Boolean).join('\n\n');
    }

    // 1. 去除 Markdown 格式标记（基础清理）
    cleaned = cleaned
        // 去除分隔线 ---
        .replace(/^\s*[-]{3,}\s*$/gm, '')
        // 去除标题标记 (# ## ### 等)
        .replace(/^#{1,6}\s*/gm, '')
        // 去除加粗标记 (**text**)
        .replace(/\*\*/g, '')
        // 去除斜体标记 (*text*)
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

        // 情感渲染
        /亲爱的/g,
        /请小心/g,
        /千万要注意/g,
        /哦[，！]?/g,
        /呢[，！]?/g,
        /呀[，！]?/g
    ];

    forbiddenPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });

    // 4. 清洗绝对方位词（替换为更自然的表达，或直接删除）
    // 注意：保留单独出现的"北"等字（如"东北门""北京"在路名中），仅清洗"向X"形式
    cleaned = cleaned
        .replace(/向(东北|东南|西北|西南|正东|正西|正南|正北|东|西|南|北)(方向)?/g, '')
        .replace(/朝(东北|东南|西北|西南|正东|正西|正南|正北|东|西|南|北)(方向)?/g, '')
        .replace(/沿(东北|东南|西北|西南|正东|正西|正南|正北|东|西|南|北)/g, '沿')
        .replace(/\s{2,}/g, ' ');

    // 3. 清理多余空白和标点
    cleaned = cleaned
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[，,]{2,}/g, '，')
        .replace(/[！!]{2,}/g, '！')
        .replace(/^\s+/gm, '')
        .trim();

    // 5. 分隔线后的段落兜底恢复：如果仍无换行，按连接词自动切分
    if (!cleaned.includes('\n') && cleaned.length > 100) {
        // 按"首先"（可能不带标点）和"最后50米/接近终点"切分
        const firstIdx = cleaned.search(/首先[，,、]?/);
        const lastIdx = cleaned.search(/(最后\s*(5[0〇]?米)?|接近终点|抵达终点前|到达终点前|终点附近)/);

        if (firstIdx > 10 && lastIdx > firstIdx) {
            const seg1 = cleaned.substring(0, firstIdx).trim();
            const seg2 = cleaned.substring(firstIdx, lastIdx).trim();
            const seg3 = cleaned.substring(lastIdx).trim();
            cleaned = `${seg1}\n\n${seg2}\n\n${seg3}`;
        }
    }

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
        hasDirection: /(左转|右转|直行|稍向左转|稍向右转|向左后方转|向右后方转|掉头)/.test(text),
        hasThreeParagraphs: text.split(/\n\n|\n/).filter(p => p.trim().length > 10).length >= 3,
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
