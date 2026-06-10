/**
 * 语言优化播报 Agent
 *
 * 模块 4.4：最终语言重构 Agent (Language Optimizer)
 *
 * 功能：
 * - 融合所有数据（IR JSON + 视觉感知数据 + 全局路径分析）
 * - 应用防范式提示词约束
 * - 输出最终的三段式盲人导航播报文案
 */

const llmClient = require('../services/llmClient');
const { getChatMessages, sanitizeOutput, validateOutput } = require('../prompts/defensivePrompts');
const { generateEnhancedPrompt } = require('./masterAgent');

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

        // 3. 构建完整的对话消息（包含全局分析）
        const messages = getChatMessages(enhancedData);

        console.log('[languageOptimizerAgent] 调用 LLM 生成播报...');

        // 4. 调用 LLM（指定使用文本模型 - 主Agent DeepSeek V4 Pro）
        // 提取 system prompt 和 user prompt 分开传递
        const systemMessage = messages.find(m => m.role === 'system');
        const userMessages = messages.filter(m => m.role !== 'system');

        const userPrompt = userMessages.map(m => {
            if (m.role === 'assistant') return '【示例输出】\n' + m.content;
            return m.content;
        }).join('\n\n==========\n\n');

        const llmResult = await llmClient.generateContent(
            userPrompt,
            [], // 语言优化不需要图片
            {
                temperature: 0.1,
                topP: 0.85,
                maxTokens: 2000,
                modelType: 'text',
                systemPrompt: systemMessage ? systemMessage.content : null
            }
        );

        if (!llmResult.success) {
            throw new Error(`LLM 调用失败: ${llmResult.error}`);
        }

        // 调试：打印原始LLM输出
        console.log('[languageOptimizerAgent] LLM 原始输出（前500字符）:');
        console.log((llmResult.text || '').substring(0, 500));
        console.log('[languageOptimizerAgent] 原始输出长度:', (llmResult.text || '').length);

        // 5. 后处理：清理禁用词
        let broadcastText = sanitizeOutput(llmResult.text);

        console.log('[languageOptimizerAgent] sanitize后长度:', broadcastText.length);
        if (broadcastText.length < 50) {
            console.warn('[languageOptimizerAgent] ⚠️ sanitize后过短，输出:', broadcastText);
        }

        // 6. 验证输出
        const validation = validateOutput(broadcastText);

        // 7. 验证失败时仅记录，不再重试（重试会导致 DeepSeek thinking 模式状态混乱）
        if (!validation.passed) {
            console.warn('[languageOptimizerAgent] 输出验证未通过:', validation.issues.join(', '));
            console.warn('[languageOptimizerAgent] 仍返回当前输出，不重试');
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

        return {
            success: true,
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
            if (node.perception_data && node.perception_data.analysis) {
                const analysis = node.perception_data.analysis;
                const additionalHazards = [];
                let rawInsights = [];

                // 1. 优先使用解析后的结构化数据
                if (analysis.parsed && !analysis.parsed.parse_error) {
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

                // 2. 从 raw_response 文本中提取关键信息（VLM 返回 Markdown 时的兜底）
                const rawText = analysis.raw_response || '';
                if (rawText) {
                    // 提取台阶数
                    const stepMatch = rawText.match(/共\s*(\d+)\s*级台阶/);
                    if (stepMatch) {
                        additionalHazards.push(`共${stepMatch[1]}级台阶`);
                        rawInsights.push(`台阶：共${stepMatch[1]}级`);
                    }
                    // 提取入口位置
                    const entranceMatch = rawText.match(/入口位置[：:]\s*([^\n]+)/);
                    if (entranceMatch) {
                        rawInsights.push(`入口：${entranceMatch[1].trim()}`);
                    }
                    // 提取触觉/听觉线索
                    const cueMatches = rawText.match(/(?:触觉线索|听觉线索|盲杖|墙面|路缘|栏杆)[^\n。]*/g);
                    if (cueMatches) {
                        cueMatches.forEach(c => {
                            const cleaned = c.replace(/^[\s*-]+/, '').trim();
                            if (cleaned.length > 5 && cleaned.length < 80) {
                                rawInsights.push(cleaned);
                            }
                        });
                    }
                    // 检测是否有天桥/台阶/障碍物
                    if (/天桥|overpass|过街天桥/.test(rawText)) {
                        if (!additionalHazards.some(h => h.includes('天桥'))) {
                            additionalHazards.push('有过街天桥');
                        }
                    }
                    if (/障碍物|obstacle|占道|停放/.test(rawText)) {
                        additionalHazards.push('路面可能有障碍物');
                    }
                }

                const existingHazards = node.hazards || [];
                const allHazards = [...new Set([...existingHazards, ...additionalHazards])];

                // 3. 合并 visual_summary：结构化 + raw 文本洞察
                const structuredSummary = extractVisualSummary(analysis);
                const rawSummary = rawInsights.length > 0 ? rawInsights.join('；') : null;

                return {
                    ...node,
                    hazards: allHazards,
                    visual_summary: structuredSummary || rawSummary,
                    visual_raw_summary: rawSummary  // 用于 prompt 中的额外信息
                };
            }

            return node;
        })
    };

    return enhanced;
}

/**
 * 从感知分析中提取视觉摘要
 */
function extractVisualSummary(analysis) {
    if (!analysis || !analysis.parsed) return null;

    const parsed = analysis.parsed;
    const summaries = [];

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
 */
function generateFallbackBroadcast(irData) {
    if (!irData || !irData.key_nodes) {
        return '路线数据加载失败，请重试。';
    }

    const summary = irData.route_summary || {};
    const nodes = irData.key_nodes || [];

    let broadcast = `全程${summary.total_distance || '未知'}，行程包含${nodes.length}个关键节点。\n\n`;

    nodes.forEach((node, index) => {
        const isLast = index === nodes.length - 1;
        const distance = node.distance_from_start || node.distance || '';
        const action = node.action || '前行';
        const direction = node.relative_direction || node.orientation || '直行';
        const road = node.road || '';

        if (isLast) {
            broadcast += `${direction}${action}，到达终点。`;
        } else {
            broadcast += `${direction}${action}${road ? '进入' + road : ''}${distance ? '，距离' + distance : ''}。\n\n`;
        }
    });

    return broadcast;
}

/**
 * 格式化播报文本为段落结构
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
 */
function estimateReadingTime(text) {
    if (!text) return 0;
    const chineseChars = (text.match(/[一-龥]/g) || []).length;
    const punctuations = (text.match(/[，。！？；：]/g) || []).length;
    return Math.ceil(chineseChars * 0.3 + punctuations * 0.5);
}

/**
 * 测试语言优化 Agent
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
                node_type: 'key',
                distance_from_start: '100米',
                action: '上天桥',
                relative_direction: '稍向左转',
                orientation: '东南',
                instruction: '向东南步行100米上天桥',
                road: '东长安街',
                hazards: ['两段连续向上台阶'],
                walk_type: 4
            },
            {
                node_index: 2,
                node_type: 'key',
                distance_from_start: '600米',
                action: '过马路',
                relative_direction: '直行',
                orientation: '南',
                instruction: '直行500米后过马路',
                road: '王府井大街',
                hazards: ['无盲道', '机非混行'],
                walk_type: 1
            },
            {
                node_index: 3,
                node_type: 'key',
                distance_from_start: '700米',
                action: '到达',
                relative_direction: '直行',
                orientation: '东',
                instruction: '到达目的地',
                road: '终点',
                hazards: ['最后50米无导航覆盖'],
                assistant_action: '到达目的地'
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
