/**
 * 路口/斑马线分析 Agent
 *
 * 专注于路口场景的视觉分析：
 * - 信号灯位置和状态
 * - 斑马线/人行横道宽度和位置
 * - 盲道铺设和延伸方向
 * - 过街提示音
 * - 车流情况和机非混行风险
 */

const llmClient = require('../services/llmClient');
const { getPerceptionSystemPrompt, getSceneModelType } = require('../prompts/promptLoader');

const name = 'IntersectionAgent';
const description = '路口/斑马线场景分析专家，关注信号灯、盲道、车流等';

/**
 * 分析路口场景
 *
 * @param {Object} node - 节点数据
 * @param {Array<string>} imagePaths - 筛选后的图片路径
 * @param {string} heading - 用户朝向方向
 * @returns {Promise<Object>} 分析结果
 */
async function analyze(node, imagePaths, heading) {
    const prompt = buildIntersectionPrompt(node, heading);

    const result = await llmClient.generateContent(
        prompt,
        imagePaths,
        {
            temperature: 0.1,
            topP: 0.85,
            maxTokens: 1000,
            modelType: 'vision'
        }
    );

    if (!result.success) {
        throw new Error(result.error || '路口分析 LLM 调用失败');
    }

    return {
        success: true,
        raw_response: result.text,
        parsed: parseResponse(result.text),
        provider: result.provider,
        scene_type: 'intersection'
    };
}

/**
 * 构建路口分析提示词
 */
function buildIntersectionPrompt(node, heading) {
    const basePrompt = getPerceptionSystemPrompt('intersection', {
        action: node.action || '过马路',
        clock_direction: node.relative_direction || '直行'
    });

    return `${basePrompt}

【额外分析重点】
作为路口分析专家，请特别关注：
1. 信号灯：是否有 audible pedestrian signals（过街提示音）
2. 斑马线位置：相对于用户朝向的具体位置
3. 盲道：是否有引导盲道延伸至路口，方向是否正确
4. 车流：是否有明显的机非混行区域
5. 安全岛：路口中间是否有安全等待区`;
}

/**
 * 解析 LLM 响应
 */
function parseResponse(text) {
    if (!text) return null;
    try {
        try {
            return JSON.parse(text);
        } catch (e) {}

        const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            return JSON.parse(jsonBlockMatch[1]);
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return { raw_text: text, parse_error: '无法解析为 JSON' };
    } catch (error) {
        return { raw_text: text, parse_error: error.message };
    }
}

module.exports = {
    name,
    description,
    analyze
};
