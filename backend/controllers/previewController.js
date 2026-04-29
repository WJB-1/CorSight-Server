/**
 * 导航预览控制器
 * 
 * Phase 3 + Phase 4：完整流水线集成
 * 
 * 处理链路：
 * 1. 高德路径规划 (Phase 3)
 * 2. 空间逻辑降噪 (Phase 3)
 * 3. 多智能体环境感知补充 (Phase 4)
 * 4. 语言 Agent 生成最终文案 (Phase 4)
 * 
 * @module previewController
 */

const amapService = require('../services/amapService');
const spatialMiddleware = require('../middleware/spatialMiddleware');
const perceptionAgent = require('../agents/perceptionAgent');
const languageOptimizerAgent = require('../agents/languageOptimizerAgent');

/**
 * POST /api/navigation/preview
 * 
 * 生成完整的导航预览（包含 IR + 播报文案）
 * 
 * Request Body:
 * {
 *   "origin": "116.434307,39.90909",
 *   "destination": "116.434446,39.90816",
 *   "options": {
 *     "enable_perception": true,  // 是否启用视觉感知
 *     "enable_broadcast": true    // 是否生成播报文案
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "text": "最终播报文案...",
 *     "ir": { ... },
 *     "metadata": { ... }
 *   }
 * }
 */
async function generatePreview(req, res) {
    try {
        const { origin, destination, options = {} } = req.body;
        const enablePerception = options.enable_perception !== false; // 默认启用
        const enableBroadcast = options.enable_broadcast !== false;   // 默认启用

        // 参数验证
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: '缺少必要参数',
                message: '请提供 origin（起点）和 destination（终点）坐标',
                example: {
                    origin: '116.434307,39.90909',
                    destination: '116.434446,39.90816'
                }
            });
        }

        console.log(`[previewController] 生成导航预览: ${origin} -> ${destination}`);
        console.log(`[previewController] 选项: 感知=${enablePerception}, 播报=${enableBroadcast}`);

        // ========== Phase 3 流程 ==========

        // 步骤 1: 调用高德服务获取步行路径
        console.log('[previewController] Step 1: 高德路径规划...');
        const pathData = await amapService.getWalkingRoute(origin, destination);

        // 步骤 2: 通过空间中间件生成 IR
        console.log('[previewController] Step 2: 空间逻辑降噪...');
        let irJson = spatialMiddleware.generateIntermediateRepresentation(pathData);

        // ========== Phase 4 流程 ==========

        // 步骤 3: 多智能体环境感知补充（可选）
        if (enablePerception && irJson.key_nodes.length > 0) {
            console.log('[previewController] Step 3: 环境感知 Agent...');
            try {
                irJson.key_nodes = await perceptionAgent.enrichNodes(irJson.key_nodes);
                console.log(`[previewController] 感知完成，${irJson.key_nodes.filter(n => n.perception_data).length} 个节点获得视觉数据`);
            } catch (perceptionError) {
                console.warn('[previewController] 视觉感知失败，继续使用基础 IR:', perceptionError.message);
                // 感知失败不中断流程，继续使用基础 IR
            }
        }

        // 步骤 4: 语言 Agent 生成最终文案（可选）
        let finalBroadcastText = null;
        let broadcastMetadata = null;

        // 先生成基础描述（不依赖LLM）
        const baseDescription = generateSimpleFallback(irJson);

        if (enableBroadcast) {
            console.log('[previewController] Step 4: 语言优化 Agent...');
            try {
                const broadcastResult = await languageOptimizerAgent.generateBroadcast(irJson);

                if (broadcastResult.success) {
                    finalBroadcastText = broadcastResult.text;
                    broadcastMetadata = {
                        validation: broadcastResult.validation,
                        fallback: broadcastResult.fallback,
                        provider: broadcastResult.provider,
                        retried: broadcastResult.retried
                    };
                    console.log('[previewController] 播报文案生成成功');
                } else {
                    throw new Error(broadcastResult.error || '播报生成失败');
                }
            } catch (broadcastError) {
                console.warn('[previewController] 播报生成失败，使用基础描述:', broadcastError.message);
                // LLM失败时，使用基础描述（不阻塞前端显示）
                finalBroadcastText = baseDescription;
                broadcastMetadata = {
                    fallback: true,
                    base_description: true,
                    error: broadcastError.message
                };
            }
        } else {
            // 不启用播报时，也返回基础描述
            finalBroadcastText = baseDescription;
            broadcastMetadata = { base_description: true };
        }

        // 返回完整结果
        // 为了前端兼容性，将 IR 数据展开到 data 层级
        const response = {
            success: true,
            data: {
                // IR 核心数据（展开到顶层，兼容前端直接访问）
                route_summary: irJson.route_summary,
                key_nodes: irJson.key_nodes,
                raw_data: irJson.raw_data,
                // 完整 IR（保留供需要时使用）
                ir: irJson,
                // 播报文案
                ...(finalBroadcastText && { text: finalBroadcastText }),
                // 元数据
                metadata: {
                    pipeline_version: 'Phase 4',
                    steps_completed: [
                        'amap_routing',
                        'spatial_filtering',
                        ...(enablePerception ? ['perception_enrichment'] : []),
                        ...(enableBroadcast ? ['broadcast_generation'] : [])
                    ],
                    ...(broadcastMetadata && { broadcast: broadcastMetadata })
                }
            }
        };

        res.json(response);

    } catch (error) {
        console.error('[previewController] 生成预览失败:', error.message);

        res.status(500).json({
            success: false,
            error: '生成导航预览失败',
            message: error.message
        });
    }
}

/**
 * GET /api/navigation/preview/simple
 * 
 * 简化版预览 - 仅返回 IR，不调用 LLM（快速响应）
 */
async function generateSimplePreview(req, res) {
    try {
        const { origin, destination } = req.query;

        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: '缺少必要参数',
                message: '请提供 origin 和 destination 查询参数'
            });
        }

        console.log(`[previewController] 生成简化预览: ${origin} -> ${destination}`);

        // 仅执行 Phase 3
        const pathData = await amapService.getWalkingRoute(origin, destination);
        const irJson = spatialMiddleware.generateIntermediateRepresentation(pathData);

        res.json({
            success: true,
            data: irJson
        });

    } catch (error) {
        console.error('[previewController] 简化预览失败:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/navigation/preview/test
 * 
 * 测试端点 - 使用预设坐标测试完整流程
 */
async function testPreview(req, res) {
    try {
        // 使用测试坐标：故宫到王府井
        const testOrigin = '116.397428,39.90923';
        const testDestination = '116.410876,39.911946';

        console.log('[previewController] 执行完整测试预览...');

        // 构建模拟请求
        const mockReq = {
            body: {
                origin: testOrigin,
                destination: testDestination,
                options: {
                    enable_perception: true,
                    enable_broadcast: true
                }
            }
        };

        // 使用 res 的代理来捕获响应
        let responseData = null;
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    responseData = { ...data, statusCode: code };
                }
            }),
            json: (data) => {
                responseData = data;
            }
        };

        await generatePreview(mockReq, mockRes);

        // 添加测试信息
        if (responseData && responseData.success) {
            responseData.test_info = {
                origin: testOrigin,
                destination: testDestination,
                origin_name: '故宫',
                destination_name: '王府井',
                description: '北京经典步行路线测试'
            };
        }

        res.json(responseData || {
            success: false,
            error: '测试执行失败'
        });

    } catch (error) {
        console.error('[previewController] 测试失败:', error.message);

        res.status(500).json({
            success: false,
            error: '测试失败',
            message: error.message
        });
    }
}

/**
 * GET /api/navigation/preview/health
 * 
 * 健康检查 - 测试所有服务连通性
 */
async function healthCheck(req, res) {
    try {
        // 测试各个组件
        const amapHealthy = await amapService.testConnectivity();
        const middlewareTest = spatialMiddleware.testMiddleware();

        // 测试 LLM 客户端（如果配置了 Key）
        let llmHealthy = false;
        try {
            const llmClient = require('../services/llmClient');
            const llmTests = await llmClient.testConnectivity();
            llmHealthy = llmTests.gemini || llmTests.qwen;
        } catch (e) {
            console.warn('[previewController] LLM 健康检查失败:', e.message);
        }

        // 确定整体状态
        let status = 'healthy';
        if (!amapHealthy) status = 'degraded';
        if (!middlewareTest.success) status = 'unhealthy';

        res.json({
            success: true,
            status: status,
            phase: 'Phase 4 - Multi-Agent System',
            checks: {
                amap_api: amapHealthy ? 'connected' : 'disconnected',
                spatial_middleware: middlewareTest.success ? 'passed' : 'failed',
                llm_client: llmHealthy ? 'ready' : 'not_configured',
                perception_agent: 'ready',
                language_optimizer: 'ready'
            },
            capabilities: {
                routing: amapHealthy,
                filtering: middlewareTest.success,
                perception: llmHealthy,
                broadcast: llmHealthy
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
}

/**
 * 生成简单降级播报
 * 
 * @param {Object} irData - IR 数据
 * @returns {string} 降级播报
 */
function generateSimpleFallback(irData) {
    if (!irData || !irData.key_nodes) {
        return '路线数据加载失败。';
    }

    const summary = irData.route_summary || {};
    const nodes = irData.key_nodes;

    let text = `全程${summary.total_distance || ''}。`;

    nodes.forEach((node, i) => {
        const isLast = i === nodes.length - 1;
        text += `${node.clock_direction || ''}${node.action || '前行'}${isLast ? '到达终点。' : '，'}`;
    });

    return text;
}

module.exports = {
    generatePreview,
    generateSimplePreview,
    testPreview,
    healthCheck
};
