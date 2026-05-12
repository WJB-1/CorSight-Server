/**
 * 目的地分析 Agent
 *
 * 专注于目的地周边的视觉分析：
 * - 建筑物/入口的外观结构（材质、大小、形状）
 * - 最后50米的精确引导
 * - 可触摸的参照物和地标
 * - 人行道材质和宽度变化
 * - 附近的指示牌文字信息
 */

const llmClient = require('../services/llmClient');
const { getPerceptionSystemPrompt } = require('../prompts/promptLoader');

const name = 'DestinationAgent';
const description = '目的地分析专家，关注最后接近策略和入口定位';

/**
 * 分析目的地场景
 *
 * @param {Object} node - 节点数据
 * @param {Array<string>} imagePaths - 筛选后的图片路径
 * @param {string} heading - 用户朝向方向
 * @returns {Promise<Object>} 分析结果
 */
async function analyze(node, imagePaths, heading) {
    const prompt = buildDestinationPrompt(node, heading);

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
        throw new Error(result.error || '目的地分析 LLM 调用失败');
    }

    return {
        success: true,
        raw_response: result.text,
        parsed: parseResponse(result.text),
        provider: result.provider,
        scene_type: 'destination'
    };
}

/**
 * 构建目的地分析提示词
 */
function buildDestinationPrompt(node, heading) {
    const placeName = node.road || node.place_name || '目的地';

    const basePrompt = getPerceptionSystemPrompt('destination', {
        place_name: placeName,
        context: node.instruction || '到达目的地'
    });

    return `${basePrompt}

【目的地专项分析重点】
作为目的地分析专家，请特别关注：
1. 入口定位：
   - 建筑物入口的精确位置（左侧/右侧/正前方）
   - 入口是否有台阶或斜坡
   - 入口材质（玻璃门/木门/自动门）——是否有触觉提示

2. 最后50米引导：
   - 从当前位置到入口的路径特征
   - 是否有可用于尾随（trailing）的墙面或栏杆
   - 地面材质变化（如从柏油路到地砖）

3. 可触摸地标：
   - 入口附近的固定参照物（柱子、花坛、栏杆）
   - 这些参照物相对于入口的位置

4. 文字信息：
   - 入口附近的门牌号、招牌文字（如果清晰可辨）
   - 这些信息是否可通过盲杖触摸到

5. 风险提醒：
   - 入口附近是否有障碍物（如停放的自行车、花坛突出）
   - 是否有台阶突然变化`;
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
