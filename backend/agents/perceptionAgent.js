/**
 * 环境感知 Agent (Master Dispatcher)
 *
 * 模块 4.3：视觉提线木偶 (Perception Agent)
 *
 * 功能：
 * - 遍历 IR JSON 中的关键节点和采样节点
 * - 拉取 MongoDB 中的 8 方位街景图
 * - 根据用户朝向和场景类型筛选相关图片
 * - 通过 Agent 注册中心分发到对应的子 Agent 处理
 * - 收集子 Agent 结果并附加到节点
 */

const corsightService = require('../services/corsightService');
const { getAgent } = require('./index');
const { selectPromptForNode } = require('../prompts/sceneScoutPrompts');

/**
 * 8方向顺序（顺时针）
 */
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * 方向到索引的映射
 */
const DIR_INDEX = {
  'N': 0, 'NE': 1, 'E': 2, 'SE': 3,
  'S': 4, 'SW': 5, 'W': 6, 'NW': 7
};

/**
 * 富化节点数据
 * 为每个节点添加视觉感知信息
 *
 * @param {Array} nodes - IR 生成的节点数组（包含 key 和 sample 类型）
 * @returns {Promise<Array>} 富化后的节点数组
 */
async function enrichNodes(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
        console.log('[perceptionAgent] 节点数组为空，跳过感知处理');
        return nodes;
    }

    console.log(`[perceptionAgent] 开始处理 ${nodes.length} 个节点的视觉感知（并发模式）`);
    const startTime = Date.now();

    // 并发处理所有节点
    const processingPromises = nodes.map(async (node, index) => {
        console.log(`[perceptionAgent] 启动节点 ${index + 1}/${nodes.length} 处理: ${node.action || '未知动作'} (${node.node_type || 'key'})`);

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

            // 4. 获取所有图片路径
            const allImagePaths = extractImagePaths(nearestPoint);

            if (allImagePaths.length === 0) {
                console.warn(`[perceptionAgent] 采样点 ${nearestPoint.point_id} 无可用图片`);
                return {
                    ...node,
                    perception_data: null,
                    perception_error: '无可用街景图片'
                };
            }

            // 5. 根据用户朝向和场景类型筛选相关图片
            const { selectedPaths, facingDirection, annotatedDirections } = selectRelevantImages(
                node,
                allImagePaths
            );

            console.log(`[perceptionAgent] 节点 ${node.node_index} 从 ${allImagePaths.length} 张图筛选为 ${selectedPaths.length} 张，面向: ${facingDirection || '未知'}`);

            // 6. 确定场景类型
            const promptSelection = selectPromptForNode({
                ...node,
                road: node.road || nearestPoint.scene_description
            });

            console.log(`[perceptionAgent] 节点 ${node.node_index} 场景类型: ${promptSelection.type}`);

            // 7. 从注册中心获取对应的子 Agent
            const agent = getAgent(promptSelection.type);

            // 8. 调用子 Agent 进行分析
            const perceptionResult = await agent.analyze(
                node,
                selectedPaths,
                facingDirection
            );

            // 9. 将感知结果附加到节点
            console.log(`[perceptionAgent] 节点 ${node.node_index} 视觉感知完成`);
            return {
                ...node,
                perception_data: {
                    point_id: nearestPoint.point_id,
                    point_distance: nearestPoint.distance_meters,
                    scene_description: nearestPoint.scene_description,
                    analysis: perceptionResult,
                    prompt_type: promptSelection.type,
                    image_count: selectedPaths.length,
                    facing_direction: facingDirection
                }
            };

        } catch (error) {
            console.error(`[perceptionAgent] 处理节点 ${node.node_index} 失败:`, error.message);

            return {
                ...node,
                perception_data: null,
                perception_error: error.message
            };
        }
    });

    const enrichedNodes = await Promise.all(processingPromises);

    const duration = Date.now() - startTime;
    console.log(`\n[perceptionAgent] 所有节点处理完成，耗时: ${duration}ms，成功: ${enrichedNodes.filter(n => n.perception_data).length}/${nodes.length}`);

    return enrichedNodes;
}

/**
 * 从节点数据中提取坐标
 *
 * @param {Object} node - 节点数据
 * @returns {Object|null} { lat, lng } 或 null
 */
function extractCoordinates(node) {
    if (node.lat && node.lng) {
        return { lat: parseFloat(node.lat), lng: parseFloat(node.lng) };
    }
    if (node.latitude && node.longitude) {
        return { lat: parseFloat(node.latitude), lng: parseFloat(node.longitude) };
    }
    if (node.polyline) {
        const coords = parsePolyline(node.polyline);
        if (coords.length > 0) {
            const midIndex = Math.floor(coords.length / 2);
            return coords[midIndex];
        }
    }
    return null;
}

/**
 * 解析高德 polyline 字符串
 *
 * @param {string} polyline - 格式: "lng,lat;lng,lat;..."
 * @returns {Array} 坐标数组
 */
function parsePolyline(polyline) {
    if (!polyline || typeof polyline !== 'string') return [];
    try {
        return polyline.split(';').map(point => {
            const [lng, lat] = point.split(',').map(Number);
            return { lat, lng };
        }).filter(coord => !isNaN(coord.lat) && !isNaN(coord.lng));
    } catch (e) {
        return [];
    }
}

/**
 * 从采样点数据中提取图片路径
 *
 * @param {Object} point - 采样点数据
 * @returns {Array<{path: string, direction: string}>} 图片路径数组
 */
function extractImagePaths(point) {
    if (!point.images) return [];
    const paths = [];
    DIRECTIONS.forEach(dir => {
        if (point.images[dir]) {
            paths.push({ path: point.images[dir], direction: dir });
        }
    });
    return paths;
}

/**
 * 根据用户朝向和场景类型筛选相关图片
 *
 * @param {Object} node - 节点数据
 * @param {Array<{path: string, direction: string}>} allImagePaths - 所有图片路径
 * @returns {Object} { selectedPaths, facingDirection, annotatedDirections }
 */
function selectRelevantImages(node, allImagePaths) {
    const sceneType = node.node_type === 'sample' ? 'path' : (node.prompt_type || 'path');

    // 获取用户朝向
    const facingDir = node.heading_direction || 'N';
    const facingIdx = DIR_INDEX[facingDir] || 0;

    let relevantDirs;

    if (sceneType === 'intersection') {
        // 路口：正前方 + 左右 + 正后方（过马路需观察对面）
        relevantDirs = [
            DIRECTIONS[(facingIdx - 1 + 8) % 8], // 左前方
            DIRECTIONS[facingIdx],                // 正前方
            DIRECTIONS[(facingIdx + 1) % 8],      // 右前方
            DIRECTIONS[(facingIdx + 4) % 8]       // 正后方（对面）
        ];
    } else if (['overpass', 'underpass', 'steps', 'elevator', 'escalator'].includes(sceneType)) {
        // 地形特征：正前方 + 左右（寻找入口/结构）
        relevantDirs = [
            DIRECTIONS[(facingIdx - 1 + 8) % 8], // 左前方
            DIRECTIONS[facingIdx],                // 正前方
            DIRECTIONS[(facingIdx + 1) % 8]       // 右前方
        ];
    } else {
        // 路段/采样点：正前方 + 左右
        relevantDirs = [
            DIRECTIONS[(facingIdx - 1 + 8) % 8], // 左前方
            DIRECTIONS[facingIdx],                // 正前方
            DIRECTIONS[(facingIdx + 1) % 8]       // 右前方
        ];
    }

    // 去重
    relevantDirs = [...new Set(relevantDirs)];

    // 筛选图片
    const selected = allImagePaths.filter(img => relevantDirs.includes(img.direction));

    // 如果筛选后为空（异常情况），返回所有图片
    if (selected.length === 0) {
        return {
            selectedPaths: allImagePaths.map(img => img.path),
            facingDirection: facingDir,
            annotatedDirections: DIRECTIONS
        };
    }

    return {
        selectedPaths: selected.map(img => img.path),
        facingDirection: facingDir,
        annotatedDirections: relevantDirs
    };
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
            node_type: 'key',
            action: '上天桥',
            heading_direction: 'NE',
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
    testPerceptionAgent,
    // 导出工具函数供测试和 Agent 使用
    extractCoordinates,
    parsePolyline,
    extractImagePaths,
    selectRelevantImages
};
