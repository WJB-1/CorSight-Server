/**
 * 环境感知 Agent
 * 
 * 模块 4.3：视觉提线木偶 (Perception Agent)
 * 
 * 功能：
 * - 遍历 IR JSON 中的关键节点
 * - 拉取 MongoDB 中的 8 方位街景图
 * - 送入 LLM 提取盲道、障碍物等微观环境细节
 */

const corsightService = require('../services/corsightService');
const llmClient = require('../services/llmClient');
const { selectPromptForNode } = require('../prompts/sceneScoutPrompts');

/**
 * 富化节点数据
 * 为每个关键节点添加视觉感知信息
 *
 * @param {Array} keyNodes - Phase 3 生成的关键节点数组
 * @returns {Promise<Array>} 富化后的节点数组
 */
async function enrichNodes(keyNodes) {
    if (!Array.isArray(keyNodes) || keyNodes.length === 0) {
        console.log('[perceptionAgent] 节点数组为空，跳过感知处理');
        return keyNodes;
    }

    console.log(`[perceptionAgent] 开始处理 ${keyNodes.length} 个节点的视觉感知（并发模式）`);
    const startTime = Date.now();

    // 优化：并发处理所有节点
    const processingPromises = keyNodes.map(async (node, index) => {
        console.log(`[perceptionAgent] 启动节点 ${index + 1}/${keyNodes.length} 处理: ${node.action || '未知道作'}`);

        try {
            // 1. 提取节点坐标
            const coordinates = extractCoordinates(node);

            if (!coordinates) {
                console.warn(`[perceptionAgent] 节点 ${node.node_index} 缺少坐标信息，跳过视觉感知`);
                return {
                    ...node,
                    perception_data: null,
                    perception_error: '缺少坐标信息'
                };
            }

            // 2. 获取附近采样点（街景数据）
            const nearbyPoints = await corsightService.getNearbyPoints(
                coordinates.lat,
                coordinates.lng,
                50 // 搜索半径 50 米
            );

            if (!nearbyPoints || nearbyPoints.length === 0) {
                console.warn(`[perceptionAgent] 节点 ${node.node_index} 附近未找到街景采样点`);
                return {
                    ...node,
                    perception_data: null,
                    perception_error: '附近无街景数据'
                };
            }

            // 3. 选择最近的采样点
            const nearestPoint = nearbyPoints[0];
            console.log(`[perceptionAgent] 节点 ${node.node_index} 找到最近采样点: ${nearestPoint.point_id}, 距离: ${nearestPoint.distance_meters}m`);

            // 4. 获取图片路径
            const imagePaths = extractImagePaths(nearestPoint);

            if (imagePaths.length === 0) {
                console.warn(`[perceptionAgent] 采样点 ${nearestPoint.point_id} 无可用图片`);
                return {
                    ...node,
                    perception_data: null,
                    perception_error: '无可用街景图片'
                };
            }

            // 5. 根据节点类型选择提示词
            const promptSelection = selectPromptForNode({
                ...node,
                road: node.road || nearestPoint.scene_description
            });

            console.log(`[perceptionAgent] 节点 ${node.node_index} 使用提示词类型: ${promptSelection.type}`);

            // 6. 调用 LLM 进行视觉分析
            const perceptionResult = await analyzeWithLLM(
                promptSelection.prompt,
                imagePaths,
                node
            );

            // 7. 将感知结果附加到节点
            console.log(`[perceptionAgent] 节点 ${node.node_index} 视觉感知完成`);
            return {
                ...node,
                perception_data: {
                    point_id: nearestPoint.point_id,
                    point_distance: nearestPoint.distance_meters,
                    scene_description: nearestPoint.scene_description,
                    analysis: perceptionResult,
                    prompt_type: promptSelection.type
                }
            };

        } catch (error) {
            console.error(`[perceptionAgent] 处理节点 ${node.node_index} 失败:`, error.message);

            // 失败时不中断整个流程，记录错误并继续
            return {
                ...node,
                perception_data: null,
                perception_error: error.message
            };
        }
    });

    // 并发执行所有节点的处理
    const enrichedNodes = await Promise.all(processingPromises);

    const duration = Date.now() - startTime;
    console.log(`\n[perceptionAgent] 所有节点处理完成，耗时: ${duration}ms，成功: ${enrichedNodes.filter(n => n.perception_data).length}/${keyNodes.length}`);

    return enrichedNodes;
}

/**
 * 从节点数据中提取坐标
 * 
 * @param {Object} node - 节点数据
 * @returns {Object|null} { lat, lng } 或 null
 */
function extractCoordinates(node) {
    // 尝试多种可能的坐标格式

    // 1. 直接坐标字段
    if (node.lat && node.lng) {
        return { lat: parseFloat(node.lat), lng: parseFloat(node.lng) };
    }

    if (node.latitude && node.longitude) {
        return { lat: parseFloat(node.latitude), lng: parseFloat(node.longitude) };
    }

    // 2. 从 polyline 字段提取（高德返回的格式）
    if (node.polyline) {
        const coords = parsePolyline(node.polyline);
        if (coords.length > 0) {
            // 取中点或终点
            const midIndex = Math.floor(coords.length / 2);
            return coords[midIndex];
        }
    }

    // 3. 从 instruction 中尝试提取坐标（不太可靠，作为后备）
    // 通常 instruction 中不包含坐标

    return null;
}

/**
 * 解析高德 polyline 字符串
 * 
 * @param {string} polyline - 格式: "lng,lat;lng,lat;..."
 * @returns {Array} 坐标数组
 */
function parsePolyline(polyline) {
    if (!polyline || typeof polyline !== 'string') {
        return [];
    }

    try {
        return polyline.split(';').map(point => {
            const [lng, lat] = point.split(',').map(Number);
            return { lat, lng };
        }).filter(coord => !isNaN(coord.lat) && !isNaN(coord.lng));
    } catch (e) {
        console.error('[perceptionAgent] 解析 polyline 失败:', e.message);
        return [];
    }
}

/**
 * 从采样点数据中提取图片路径
 * 
 * @param {Object} point - 采样点数据
 * @returns {Array<string>} 图片路径数组
 */
function extractImagePaths(point) {
    if (!point.images) {
        return [];
    }

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const paths = [];

    // 提取 8 方位图片
    directions.forEach(dir => {
        if (point.images[dir]) {
            paths.push(point.images[dir]);
        }
    });

    return paths;
}

/**
 * 使用 LLM 分析街景图片
 * 
 * @param {string} prompt - 提示词
 * @param {Array<string>} imagePaths - 图片路径数组
 * @param {Object} node - 节点上下文
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeWithLLM(prompt, imagePaths, node) {
    try {
        console.log(`[perceptionAgent] 调用 LLM 分析，图片数: ${imagePaths.length}`);

        // 优化：调用 LLM 客户端，指定使用视觉模型
        const result = await llmClient.generateContent(
            prompt,
            imagePaths,
            {
                temperature: 0.1,
                topP: 0.85,
                maxTokens: 1000,
                modelType: 'vision'  // 指定使用视觉模型
            }
        );

        if (!result.success) {
            throw new Error(result.error || 'LLM 调用失败');
        }

        // 解析 LLM 返回的 JSON
        const analysis = parseLLMResponse(result.text);

        return {
            success: true,
            raw_response: result.text,
            parsed: analysis,
            provider: result.provider,
            fallback: result.fallback || false
        };

    } catch (error) {
        console.error('[perceptionAgent] LLM 分析失败:', error.message);

        return {
            success: false,
            error: error.message,
            raw_response: null,
            parsed: null
        };
    }
}

/**
 * 解析 LLM 返回的响应文本
 * 尝试提取 JSON 部分
 * 
 * @param {string} text - LLM 原始响应
 * @returns {Object|null} 解析后的 JSON 或 null
 */
function parseLLMResponse(text) {
    if (!text) return null;

    try {
        // 1. 尝试直接解析
        try {
            return JSON.parse(text);
        } catch (e) {
            // 继续尝试其他方式
        }

        // 2. 尝试提取 JSON 代码块
        const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch) {
            return JSON.parse(jsonBlockMatch[1]);
        }

        // 3. 尝试找到 JSON 对象的开始和结束
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        // 4. 如果都无法解析，返回原始文本
        return {
            raw_text: text,
            parse_error: '无法解析为 JSON'
        };

    } catch (error) {
        console.error('[perceptionAgent] 解析 LLM 响应失败:', error.message);
        return {
            raw_text: text,
            parse_error: error.message
        };
    }
}

/**
 * 延迟函数
 * 
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 测试感知 Agent
 * 
 * @returns {Promise<Object>} 测试结果
 */
async function testPerceptionAgent() {
    const testNodes = [
        {
            node_index: 1,
            action: '上天桥',
            clock_direction: '11点钟方向',
            instruction: '向东南步行50米上天桥',
            road: '东长安街',
            distance: '50米',
            polyline: '116.397428,39.90923;116.397528,39.90933'
        }
    ];

    try {
        const result = await enrichNodes(testNodes);
        return {
            success: true,
            nodes_processed: result.length,
            nodes_with_perception: result.filter(n => n.perception_data).length,
            sample: result[0]
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    enrichNodes,
    testPerceptionAgent
};
