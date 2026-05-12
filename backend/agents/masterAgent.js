/**
 * 主 Agent (Master Agent)
 *
 * 模块 4.2：路径全局分析与任务调度
 *
 * 功能：
 * - 全局路径统计（天桥数、路口数、风险点汇总）
 * - 节点配对分析（上天桥↔下天桥、进地下通道↔出地下通道）
 * - 信息冲突检测（如入口有盲道但出口无盲道）
 * - 为 Language Optimizer 生成增强的结构化报告
 */

/**
 * 分析路径全局特征
 *
 * @param {Object} irData - IR 数据
 * @returns {Object} 全局分析结果
 */
function analyzeRouteGlobally(irData) {
    const nodes = irData.key_nodes || [];

    if (nodes.length === 0) {
        return {
            stats: {},
            pairs: [],
            risk_summary: {},
            segments: [],
            conflicts: []
        };
    }

    const stats = computeStats(nodes);
    const pairs = findNodePairs(nodes);
    const riskSummary = computeRiskSummary(nodes);
    const segments = analyzeContinuousSegments(nodes);
    const conflicts = detectConflicts(nodes, pairs);

    return {
        stats,
        pairs,
        risk_summary: riskSummary,
        segments,
        conflicts
    };
}

/**
 * 计算路径统计信息
 */
function computeStats(nodes) {
    const stats = {
        total_nodes: nodes.length,
        key_nodes: nodes.filter(n => n.node_type === 'key').length,
        sample_nodes: nodes.filter(n => n.node_type === 'sample').length,
        total_overpass: 0,
        total_underpass: 0,
        total_crossings: 0,
        total_steps: 0,
        total_elevator: 0,
        total_escalator: 0,
        total_turns: 0
    };

    nodes.forEach(node => {
        const wt = node.walk_type;
        const action = node.action || '';

        if (wt === 4 || wt === 22) stats.total_overpass++;
        if (wt === 3 || wt === 12 || wt === 13 || wt === 23) stats.total_underpass++;
        if (wt === 1) stats.total_crossings++;
        if (wt === 20 || wt === 21) stats.total_steps++;
        if (wt === 8) stats.total_escalator++;
        if (wt === 9) stats.total_elevator++;

        if (['左转', '右转', '向左前方', '向右前方', '向左后方', '向右后方', '调头', '掉头'].includes(action)) {
            stats.total_turns++;
        }
    });

    return stats;
}

/**
 * 查找节点配对（如上天桥↔下天桥）
 */
function findNodePairs(nodes) {
    const pairs = [];
    const used = new Set();

    for (let i = 0; i < nodes.length; i++) {
        if (used.has(i)) continue;

        const node = nodes[i];
        const wt = node.walk_type;

        // 天桥配对
        if (wt === 4 || wt === 22) {
            const pair = findPair(nodes, i, used, n => n.walk_type === 4 || n.walk_type === 22);
            if (pair) {
                pairs.push({
                    type: 'overpass',
                    type_name: '天桥',
                    entrance_index: pair[0] + 1,
                    exit_index: pair[1] + 1,
                    entrance: nodes[pair[0]],
                    exit: nodes[pair[1]]
                });
            }
        }

        // 地下通道配对
        if (wt === 3 || wt === 12 || wt === 13 || wt === 23) {
            const pair = findPair(nodes, i, used, n => n.walk_type === 3 || n.walk_type === 12 || n.walk_type === 13 || n.walk_type === 23);
            if (pair) {
                pairs.push({
                    type: 'underpass',
                    type_name: '地下通道',
                    entrance_index: pair[0] + 1,
                    exit_index: pair[1] + 1,
                    entrance: nodes[pair[0]],
                    exit: nodes[pair[1]]
                });
            }
        }
    }

    return pairs;
}

/**
 * 在指定位置之后查找配对的节点
 */
function findPair(nodes, startIndex, used, matchFn) {
    for (let j = startIndex + 1; j < nodes.length; j++) {
        if (!used.has(j) && matchFn(nodes[j])) {
            used.add(startIndex);
            used.add(j);
            return [startIndex, j];
        }
    }
    return null;
}

/**
 * 计算风险汇总
 */
function computeRiskSummary(nodes) {
    const risks = {
        no_tactile_paving: [],
        mixed_traffic: [],
        stairs: [],
        no_audible_signals: [],
        obstacles: [],
        narrow_sidewalk: []
    };

    nodes.forEach((node, index) => {
        const hazards = node.hazards || [];
        const perception = node.perception_data?.analysis?.parsed;

        // 从 hazards 提取
        hazards.forEach(h => {
            if (h.includes('无盲道') || h.includes('无触觉')) {
                risks.no_tactile_paving.push({ node_index: index + 1, description: h });
            }
            if (h.includes('机非混行') || h.includes('车流')) {
                risks.mixed_traffic.push({ node_index: index + 1, description: h });
            }
            if (h.includes('台阶') || h.includes('楼梯')) {
                risks.stairs.push({ node_index: index + 1, description: h });
            }
            if (h.includes('无提示音') || h.includes('无过街提示')) {
                risks.no_audible_signals.push({ node_index: index + 1, description: h });
            }
            if (h.includes('障碍') || h.includes('占道') || h.includes('施工')) {
                risks.obstacles.push({ node_index: index + 1, description: h });
            }
        });

        // 从感知数据提取
        if (perception) {
            if (perception.accessibility_analysis?.tactile_paving?.includes('无')) {
                risks.no_tactile_paving.push({ node_index: index + 1, description: '感知分析：无盲道铺设' });
            }
            if (perception.accessibility_analysis?.audible_signals?.includes('无')) {
                risks.no_audible_signals.push({ node_index: index + 1, description: '感知分析：无过街提示音' });
            }
            if (perception.sidewalk?.obstacles?.length > 0) {
                perception.sidewalk.obstacles.forEach(obs => {
                    risks.obstacles.push({ node_index: index + 1, description: obs });
                });
            }
        }
    });

    // 去重
    for (const key of Object.keys(risks)) {
        const seen = new Set();
        risks[key] = risks[key].filter(item => {
            const id = `${item.node_index}-${item.description}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    return risks;
}

/**
 * 分析连续路段特征
 */
function analyzeContinuousSegments(nodes) {
    const segments = [];
    let currentSegment = {
        start_index: 1,
        type: 'start',
        description: '起点'
    };

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // 识别路段类型变化
        if (node.node_type === 'sample') {
            if (currentSegment.type !== 'straight') {
                if (currentSegment.start_index <= i) {
                    segments.push({ ...currentSegment, end_index: i });
                }
                currentSegment = {
                    start_index: i + 1,
                    type: 'straight',
                    description: '长直路段'
                };
            }
        } else if (node.walk_type === 4 || node.walk_type === 22) {
            if (currentSegment.type !== 'overpass') {
                if (currentSegment.start_index <= i) {
                    segments.push({ ...currentSegment, end_index: i });
                }
                currentSegment = {
                    start_index: i + 1,
                    type: 'overpass',
                    description: '天桥路段'
                };
            }
        } else if (node.walk_type === 3 || node.walk_type === 12 || node.walk_type === 13 || node.walk_type === 23) {
            if (currentSegment.type !== 'underpass') {
                if (currentSegment.start_index <= i) {
                    segments.push({ ...currentSegment, end_index: i });
                }
                currentSegment = {
                    start_index: i + 1,
                    type: 'underpass',
                    description: '地下通道路段'
                };
            }
        }
    }

    // 添加最后一段
    if (currentSegment.start_index <= nodes.length) {
        segments.push({ ...currentSegment, end_index: nodes.length });
    }

    return segments;
}

/**
 * 检测信息冲突
 */
function detectConflicts(nodes, pairs) {
    const conflicts = [];

    for (const pair of pairs) {
        const entrance = pair.entrance;
        const exit = pair.exit;

        if (!entrance.perception_data?.analysis?.parsed || !exit.perception_data?.analysis?.parsed) {
            continue;
        }

        const entranceData = entrance.perception_data.analysis.parsed;
        const exitData = exit.perception_data.analysis.parsed;

        // 盲道一致性检查
        const entranceTactile = entranceData.entrance?.tactile_paving || entranceData.accessibility_analysis?.tactile_paving;
        const exitTactile = exitData.exit?.tactile_paving || exitData.accessibility_analysis?.tactile_paving;

        if (entranceTactile && exitTactile) {
            const entranceHas = !entranceTactile.includes('无');
            const exitHas = !exitTactile.includes('无');
            if (entranceHas !== exitHas) {
                conflicts.push({
                    type: 'tactile_paving_mismatch',
                    pair_type: pair.type,
                    nodes: [pair.entrance_index, pair.exit_index],
                    description: `${pair.type_name}入口有盲道，出口无盲道，可能存在中断`,
                    severity: 'high'
                });
            }
        }

        // 扶手一致性检查
        const entranceHandrail = entranceData.entrance?.handrail;
        const exitHandrail = exitData.exit?.handrail;
        if (entranceHandrail && exitHandrail) {
            const entranceHas = !entranceHandrail.includes('无');
            const exitHas = !exitHandrail.includes('无');
            if (entranceHas !== exitHas) {
                conflicts.push({
                    type: 'handrail_mismatch',
                    pair_type: pair.type,
                    nodes: [pair.entrance_index, pair.exit_index],
                    description: `${pair.type_name}入口和出口扶手情况不一致`,
                    severity: 'medium'
                });
            }
        }
    }

    // 检查连续节点的方向一致性
    for (let i = 0; i < nodes.length - 1; i++) {
        const curr = nodes[i];
        const next = nodes[i + 1];

        // 如果两个节点都是转向，且距离很近，可能是同一复杂路口
        const isTurn = ['左转', '右转', '向左前方', '向右前方'].includes(curr.action);
        const nextIsTurn = ['左转', '右转', '向左前方', '向右前方'].includes(next.action);

        if (isTurn && nextIsTurn) {
            const currDist = parseDistance(curr.distance_from_start);
            const nextDist = parseDistance(next.distance_from_start);
            if (Math.abs(nextDist - currDist) < 50) {
                conflicts.push({
                    type: 'complex_intersection',
                    nodes: [i + 1, i + 2],
                    description: '连续两个转向节点距离很近，可能属于同一复杂路口',
                    severity: 'low'
                });
            }
        }
    }

    return conflicts;
}

/**
 * 解析距离字符串为数字（米）
 */
function parseDistance(distStr) {
    if (!distStr) return 0;
    const match = distStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * 生成增强的 User Prompt（供 Language Optimizer 使用）
 *
 * @param {Object} irData - IR 数据
 * @returns {string} 增强后的结构化文本
 */
function generateEnhancedPrompt(irData) {
    const globalAnalysis = analyzeRouteGlobally(irData);
    const summary = irData.route_summary || {};
    const nodes = irData.key_nodes || [];

    let prompt = `【路线全局概览】\n`;
    prompt += `全程${summary.total_distance || '未知'}，预计${summary.duration_estimate || '未知'}。\n`;

    const stats = globalAnalysis.stats;
    const features = [];
    if (stats.total_overpass > 0) features.push(`${stats.total_overpass}座天桥`);
    if (stats.total_underpass > 0) features.push(`${stats.total_underpass}段地下通道`);
    if (stats.total_crossings > 0) features.push(`${stats.total_crossings}个路口`);
    if (stats.total_steps > 0) features.push(`${stats.total_steps}处台阶`);
    if (stats.total_turns > 0) features.push(`${stats.total_turns}次转向`);

    if (features.length > 0) {
        prompt += `路线包含：${features.join('、')}。\n`;
    }

    // 风险汇总
    const risks = globalAnalysis.risk_summary;
    const riskItems = [];
    if (risks.no_tactile_paving?.length > 0) riskItems.push(`${risks.no_tactile_paving.length}处无盲道`);
    if (risks.mixed_traffic?.length > 0) riskItems.push(`${risks.mixed_traffic.length}处机非混行`);
    if (risks.stairs?.length > 0) riskItems.push(`${risks.stairs.length}处台阶`);
    if (risks.no_audible_signals?.length > 0) riskItems.push(`${risks.no_audible_signals.length}处无过街提示音`);
    if (risks.obstacles?.length > 0) riskItems.push(`${risks.obstacles.length}处障碍物`);

    if (riskItems.length > 0) {
        prompt += `主要风险：${riskItems.join('、')}。\n`;
    }

    prompt += `\n`;

    // 节点配对关系
    if (globalAnalysis.pairs.length > 0) {
        prompt += `【节点配对关系】\n`;
        for (const pair of globalAnalysis.pairs) {
            prompt += `- ${pair.type_name}（节点${pair.entrance_index}→节点${pair.exit_index}）\n`;
        }
        prompt += `\n`;
    }

    // 冲突警告
    if (globalAnalysis.conflicts.length > 0) {
        prompt += `【需要特别注意】\n`;
        for (const conflict of globalAnalysis.conflicts) {
            if (conflict.severity === 'high') {
                prompt += `⚠ ${conflict.description}\n`;
            }
        }
        prompt += `\n`;
    }

    return prompt;
}

module.exports = {
    analyzeRouteGlobally,
    computeStats,
    findNodePairs,
    computeRiskSummary,
    analyzeContinuousSegments,
    detectConflicts,
    generateEnhancedPrompt
};
