/**
 * 地形特征分析 Agent
 *
 * 专注于天桥、地下通道、台阶、电梯、扶梯等复杂地形的视觉分析：
 * - 入口位置和宽度
 * - 台阶数量和方向（上/下）
 * - 扶手、盲道接入情况
 * - 出口朝向和衔接
 * - 替代方案（如电梯替代台阶）
 */

const llmClient = require('../services/llmClient');
const { getPerceptionSystemPrompt } = require('../prompts/promptLoader');

const name = 'TerrainAgent';
const description = '地形特征分析专家（天桥/地下通道/台阶/电梯/扶梯），关注入口、台阶、扶手等';

// 地形类型中文映射
const FEATURE_NAMES = {
    'overpass': '天桥/人行天桥',
    'underpass': '地下通道',
    'steps': '台阶/楼梯',
    'elevator': '电梯',
    'escalator': '扶梯',
    'bridge': '桥梁'
};

/**
 * 分析地形场景
 *
 * @param {Object} node - 节点数据
 * @param {Array<string>} imagePaths - 筛选后的图片路径
 * @param {string} heading - 用户朝向方向
 * @returns {Promise<Object>} 分析结果
 */
async function analyze(node, imagePaths, heading) {
    const featureType = node.prompt_type || node.feature_type || 'steps';
    const prompt = buildTerrainPrompt(node, heading, featureType);

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
        throw new Error(result.error || '地形分析 LLM 调用失败');
    }

    return {
        success: true,
        raw_response: result.text,
        parsed: parseResponse(result.text),
        provider: result.provider,
        scene_type: featureType
    };
}

/**
 * 构建地形分析提示词
 */
function buildTerrainPrompt(node, heading, featureType) {
    const featureName = FEATURE_NAMES[featureType] || '特殊地形';

    const basePrompt = getPerceptionSystemPrompt('feature', {
        feature_type: featureType,
        feature_name: featureName,
        action: node.action || '通过',
        clock_direction: node.relative_direction || '直行'
    });

    let extraFocus = '';
    switch (featureType) {
        case 'overpass':
            extraFocus = `
【天桥专项分析】
- 入口台阶：数量、是否有扶手、是否有盲道引导
- 桥面：是否平坦、是否有防滑处理
- 出口台阶：与入口是否对称
- 替代方案：附近是否有地下通道或斑马线可替代`;
            break;
        case 'underpass':
            extraFocus = `
【地下通道专项分析】
- 入口：是否有明显的下坡/台阶提示
- 通道内部：照明情况、是否有盲道中线、宽度
- 出口：上坡/台阶情况、出口后衔接的道路
- 注意：地下通道内GPS可能失效，需详细描述内部环境`;
            break;
        case 'steps':
            extraFocus = `
【台阶专项分析】
- 台阶总数、每段台阶数量
- 是否有休息平台（landing）
- 扶手：单侧/双侧、材质、连续性
- 盲道：入口和出口是否有盲道衔接
- 台阶边缘是否有触觉提示条`;
            break;
        case 'elevator':
            extraFocus = `
【电梯专项分析】
- 电梯位置：相对于行进方向的精确位置
- 按钮高度：是否适合轮椅/盲杖使用者
- 语音提示：是否有楼层播报
- 替代方案：如果电梯故障，附近是否有楼梯`;
            break;
        case 'escalator':
            extraFocus = `
【扶梯专项分析】
- 运行方向：当前运行方向（上/下）
- 入口：是否有明显的触觉提示（如地面纹理变化）
- 安全提示：是否有紧急停止按钮位置
- 替代方案：附近是否有直梯或楼梯`;
            break;
    }

    return `${basePrompt}${extraFocus}`;
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
