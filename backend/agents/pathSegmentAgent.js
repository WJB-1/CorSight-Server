/**
 * 路段/采样点分析 Agent
 *
 * 专注于普通路段和采样点的视觉分析：
 * - 人行道宽度和材质
 * - 盲道连续性
 * - 障碍物（施工、停车、占道等）
 * - 路面平整度
 * - 两侧环境（建筑/围墙/绿化）
 */

const llmClient = require('../services/llmClient');
const { getPerceptionSystemPrompt } = require('../prompts/promptLoader');

const name = 'PathSegmentAgent';
const description = '路段分析专家，关注路面、盲道、障碍物等';

/**
 * 分析路段场景
 *
 * @param {Object} node - 节点数据
 * @param {Array<string>} imagePaths - 筛选后的图片路径
 * @param {string} heading - 用户朝向方向
 * @returns {Promise<Object>} 分析结果
 */
async function analyze(node, imagePaths, heading) {
    const prompt = buildPathPrompt(node, heading);

    const result = await llmClient.generateContent(
        prompt,
        imagePaths,
        {
            temperature: 0.1,
            topP: 0.85,
            maxTokens: 800,
            modelType: 'vision'
        }
    );

    if (!result.success) {
        throw new Error(result.error || '路段分析 LLM 调用失败');
    }

    return {
        success: true,
        raw_response: result.text,
        parsed: parseResponse(result.text),
        provider: result.provider,
        scene_type: 'path'
    };
}

/**
 * 构建路段分析提示词
 */
function buildPathPrompt(node, heading) {
    const isSample = node.node_type === 'sample';

    const basePrompt = getPerceptionSystemPrompt('path', {
        road_name: node.road || '未知道路',
        orientation: node.orientation || '直行'
    });

    const focusText = isSample
        ? `【采样点分析重点】
这是一个路段采样点（非拐点），请提供该路段的概括性描述：
- 路面整体状况（平整/有坑洼/施工）
- 盲道是否连续
- 是否有明显障碍物
- 两侧环境是否有可用于导航的参照物（如连续围墙、行道树等）
请简明扼要，不需要像路口那样详细。`
        : `【路段分析重点】
- 人行道宽度（宽/中/窄）
- 地面材质和纹理变化
- 盲道铺设情况和连续性
- 障碍物：自行车、施工围挡、停车、占道经营等
- 两侧环境：建筑/围墙/绿化/街道
- 可用于导航的触觉/听觉线索`;

    return `${basePrompt}\n\n${focusText}`;
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
