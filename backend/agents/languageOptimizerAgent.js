/**
 * 语言优化播报 Agent
 * 
 * 模块 4.4：最终语言重构 Agent (Language Optimizer)
 * 
 * 功能：
 * - 融合所有数据（IR JSON + 视觉感知数据）
 * - 应用防范式提示词约束
 * - 输出最终的三段式盲人导航播报文案
 */

const llmClient = require('../services/llmClient');
const { getChatMessages, sanitizeOutput, validateOutput } = require('../prompts/defensivePrompts');

/**
 * 生成最终播报文案
 * 
 * @param {Object} irData - 富化后的 IR JSON 数据（包含 perception_data）
 * @returns {Promise<Object>} 播报结果 { success, text, error, validation }
 */
async function generateBroadcast(irData) {
    try {
        console.log('[languageOptimizerAgent] 开始生成最终播报文案');

        // 1. 验证输入数据
        if (!irData || !irData.key_nodes || irData.key_nodes.length === 0) {
            throw new Error('IR 数据无效或缺少关键节点');
        }

        // 2. 准备增强的 IR 数据（融合感知数据）
        const enhancedData = enhanceIRWithPerception(irData);

        console.log(`[languageOptimizerAgent] 处理 ${enhancedData.key_nodes.length} 个节点`);

        // 3. 构建完整的对话消息
        const messages = getChatMessages(enhancedData);

        console.log('[languageOptimizerAgent] 调用 LLM 生成播报...');

        // 4. 调用 LLM（优化：指定使用文本模型）
        const llmResult = await llmClient.generateContent(
            messages[2].content, // User prompt
            [], // 语言优化不需要图片
            {
                temperature: 0.1,
                topP: 0.85,
                maxTokens: 1000,
                modelType: 'text'  // 指定使用文本模型
            }
        );

        if (!llmResult.success) {
            throw new Error(`LLM 调用失败: ${llmResult.error}`);
        }

        // 5. 后处理：清理禁用词
        let broadcastText = sanitizeOutput(llmResult.text);

        // 6. 验证输出
        const validation = validateOutput(broadcastText);

        // 7. 如果验证失败，尝试重试一次
        if (!validation.passed && !llmResult.fallback) {
            console.warn('[languageOptimizerAgent] 输出验证失败，尝试重试...');
            console.warn('问题:', validation.issues.join(', '));

            // 重试一次，在提示词中强调问题
            const retryMessages = [
                ...messages,
                {
                    role: 'assistant',
                    content: llmResult.text
                },
                {
                    role: 'user',
                    content: `上述输出存在以下问题，请修正后重新生成：${validation.issues.join('、')}。必须严格遵守系统指令中的所有约束法则。`
                }
            ];

            const retryResult = await llmClient.generateContent(
                retryMessages.map(m => m.content).join('\n\n'),
                [],
                {
                    temperature: 0.05, // 更低温度
                    topP: 0.8,
                    maxTokens: 1000
                }
            );

            if (retryResult.success) {
                broadcastText = sanitizeOutput(retryResult.text);
                const retryValidation = validateOutput(broadcastText);

                return {
                    success: true,
                    text: broadcastText,
                    validation: retryValidation,
                    retried: true,
                    provider: retryResult.provider,
                    fallback: retryResult.fallback || false
                };
            }
        }

        console.log('[languageOptimizerAgent] 播报文案生成完成');

        return {
            success: true,
            text: broadcastText,
            validation: validation,
            retried: false,
            provider: llmResult.provider,
            fallback: llmResult.fallback || false
        };

    } catch (error) {
        console.error('[languageOptimizerAgent] 生成播报失败:', error.message);

        // 返回降级响应
        return {
            success: true, // 标记为成功，但带有错误信息
            text: generateFallbackBroadcast(irData),
            error: error.message,
            fallback: true,
            validation: { passed: false, issues: [error.message] }
        };
    }
}

/**
 * 将感知数据融合到 IR 数据中
 * 
 * @param {Object} irData - 原始 IR 数据
 * @returns {Object} 增强后的 IR 数据
 */
function enhanceIRWithPerception(irData) {
    const enhanced = {
        ...irData,
        key_nodes: irData.key_nodes.map(node => {
            // 如果节点有感知数据，将其融合到 hazards 中
            if (node.perception_data && node.perception_data.analysis) {
                const analysis = node.perception_data.analysis;

                // 从感知分析中提取风险点
                const additionalHazards = [];

                if (analysis.parsed) {
                    // 根据提示词类型提取不同的信息
                    if (analysis.parsed.hazards) {
                        additionalHazards.push(...analysis.parsed.hazards);
                    }

                    if (analysis.parsed.accessibility_analysis) {
                        const aa = analysis.parsed.accessibility_analysis;
                        if (aa.tactile_paving && aa.tactile_paving.includes('无')) {
                            additionalHazards.push('无盲道铺设');
                        }
                        if (aa.audible_signals && aa.audible_signals.includes('无')) {
                            additionalHazards.push('无过街提示音');
                        }
                    }

                    if (analysis.parsed.sidewalk) {
                        const sw = analysis.parsed.sidewalk;
                        if (sw.obstacles && Array.isArray(sw.obstacles)) {
                            additionalHazards.push(...sw.obstacles);
                        }
                    }
                }

                // 合并 hazards，去重
                const existingHazards = node.hazards || [];
                const allHazards = [...new Set([...existingHazards, ...additionalHazards])];

                return {
                    ...node,
                    hazards: allHazards,
                    // 添加视觉描述摘要
                    visual_summary: extractVisualSummary(analysis)
                };
            }

            return node;
        })
    };

    return enhanced;
}

/**
 * 从感知分析中提取视觉摘要
 * 
 * @param {Object} analysis - 感知分析结果
 * @returns {string|null} 视觉摘要
 */
function extractVisualSummary(analysis) {
    if (!analysis || !analysis.parsed) return null;

    const parsed = analysis.parsed;
    const summaries = [];

    // 根据不同类型的分析提取摘要
    if (parsed.accessibility_analysis) {
        const aa = parsed.accessibility_analysis;
        if (aa.tactile_paving) summaries.push(`盲道: ${aa.tactile_paving}`);
        if (aa.audible_signals) summaries.push(`提示音: ${aa.audible_signals}`);
    }

    if (parsed.sidewalk) {
        const sw = parsed.sidewalk;
        if (sw.width) summaries.push(`人行道宽度: ${sw.width}`);
        if (sw.surface) summaries.push(`路面: ${sw.surface}`);
    }

    if (parsed.guidance) {
        const g = parsed.guidance;
        if (g.tactile_cues) summaries.push(`触觉线索: ${g.tactile_cues}`);
        if (g.auditory_cues) summaries.push(`听觉线索: ${g.auditory_cues}`);
    }

    return summaries.length > 0 ? summaries.join('；') : null;
}

/**
 * 生成降级播报文案
 * 当 LLM 调用失败时返回的基础播报
 * 
 * @param {Object} irData - IR 数据
 * @returns {string} 降级播报文案
 */
function generateFallbackBroadcast(irData) {
    if (!irData || !irData.key_nodes) {
        return '路线数据加载失败，请重试。';
    }

    const summary = irData.route_summary || {};
    const nodes = irData.key_nodes || [];

    // 构建基础播报
    let broadcast = `全程${summary.total_distance || '未知'}，行程包含${nodes.length}个关键节点。\n\n`;

    // 节点播报
    nodes.forEach((node, index) => {
        const isLast = index === nodes.length - 1;
        const distance = node.distance_from_start || node.distance || '';
        const action = node.action || '前行';
        const clock = node.clock_direction || '12点钟方向';
        const road = node.road || '';

        if (isLast) {
            broadcast += `${clock}${action}，到达终点。`;
        } else {
            broadcast += `${clock}${action}${road ? '进入' + road : ''}${distance ? '，距离' + distance : ''}。\n\n`;
        }
    });

    return broadcast;
}

/**
 * 格式化播报文本为段落结构
 * 
 * @param {string} text - 原始播报文本
 * @returns {Object} 分段后的结构
 */
function formatBroadcast(text) {
    if (!text) return null;

    const paragraphs = text.split('\n\n').filter(p => p.trim());

    return {
        full_text: text,
        paragraphs: paragraphs,
        paragraph_count: paragraphs.length,
        estimated_duration: estimateReadingTime(text)
    };
}

/**
 * 估算播报时长
 * 
 * @param {string} text - 播报文本
 * @returns {number} 预估秒数
 */
function estimateReadingTime(text) {
    if (!text) return 0;

    // 中文字符：每个字约 0.3 秒
    // 标点符号：每个约 0.5 秒停顿
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const punctuations = (text.match(/[，。！？；：]/g) || []).length;

    return Math.ceil(chineseChars * 0.3 + punctuations * 0.5);
}

/**
 * 测试语言优化 Agent
 * 
 * @returns {Promise<Object>} 测试结果
 */
async function testLanguageOptimizer() {
    const testIR = {
        route_summary: {
            total_distance: '700米',
            duration_estimate: '12分钟',
            compression_ratio: '40%'
        },
        key_nodes: [
            {
                node_index: 1,
                distance_from_start: '100米',
                action: '上天桥',
                clock_direction: '11点钟方向',
                instruction: '向东南步行100米上天桥',
                road: '东长安街',
                hazards: ['两段连续向上台阶']
            },
            {
                node_index: 2,
                distance_from_start: '600米',
                action: '过马路',
                clock_direction: '12点钟方向',
                instruction: '直行500米后过马路',
                road: '王府井大街',
                hazards: ['无盲道', '机非混行']
            },
            {
                node_index: 3,
                distance_from_start: '700米',
                action: '到达',
                clock_direction: '12点钟方向',
                instruction: '到达目的地',
                road: '终点',
                hazards: ['最后50米无导航覆盖']
            }
        ]
    };

    try {
        const result = await generateBroadcast(testIR);
        return {
            success: result.success,
            text_preview: result.text?.substring(0, 200) + '...',
            validation: result.validation,
            fallback: result.fallback,
            formatted: formatBroadcast(result.text)
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    generateBroadcast,
    formatBroadcast,
    estimateReadingTime,
    testLanguageOptimizer
};
