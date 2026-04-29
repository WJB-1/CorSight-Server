/**
 * 高德地图 Web 服务 - 步行路径规划
 *
 * 模块 3.1：高德 Web 服务路由请求
 * 向高德地图 Web 服务 API 发起步行路径规划请求
 *
 * @module amapService
 */

const axios = require('axios');
const config = require('../config/envConfig');

// 高德 Web 服务 API 基础配置
const AMAP_WEB_API = 'https://restapi.amap.com/v3/direction/walking';

/**
 * 获取步行路径规划
 * 
 * @param {string} origin - 起点坐标，格式："lng,lat" (如 "116.434307,39.90909")
 * @param {string} destination - 终点坐标，格式："lng,lat"
 * @returns {Promise<Object>} 高德返回的路径数据 (route.paths[0])
 * @throws {Error} 当请求失败或高德返回错误时抛出
 */
async function getWalkingRoute(origin, destination) {
    try {
        const key = config.amap.AMAP_WEB_KEY;

        if (!key) {
            throw new Error('AMAP_WEB_KEY 未配置，请在 .env 文件中设置');
        }

        if (!origin || !destination) {
            throw new Error('起点和终点坐标不能为空');
        }

        // 验证坐标格式
        const validateCoord = (coord, name) => {
            const parts = coord.split(',');
            if (parts.length !== 2) {
                throw new Error(`${name} 坐标格式错误，应为 "lng,lat"`);
            }
            const [lng, lat] = parts.map(Number);
            if (isNaN(lng) || isNaN(lat)) {
                throw new Error(`${name} 坐标必须为有效数字`);
            }
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                throw new Error(`${name} 坐标超出有效范围`);
            }
        };

        validateCoord(origin, '起点');
        validateCoord(destination, '终点');

        // 构建请求参数
        const params = {
            origin,
            destination,
            key
        };

        console.log(`[amapService] 请求步行路径: ${origin} -> ${destination}`);

        // 发送请求
        const response = await axios.get(AMAP_WEB_API, {
            params,
            timeout: 10000 // 10秒超时
        });

        // 解析响应
        const data = response.data;

        // 校验高德返回状态
        if (data.status !== '1') {
            const errorInfo = data.info || '未知错误';
            throw new Error(`高德 API 返回错误: ${errorInfo}`);
        }

        // 检查是否有路线数据
        if (!data.route || !data.route.paths || data.route.paths.length === 0) {
            throw new Error('未找到可行的步行路线');
        }

        // 提取第一条路径（最优路径）
        const path = data.route.paths[0];

        console.log(`[amapService] 获取路径成功，距离: ${path.distance}米，预计时间: ${path.duration}秒`);

        return path;

    } catch (error) {
        console.error('[amapService] 获取步行路径失败:', error.message);
        throw error;
    }
}

/**
 * 测试高德 API 连通性
 * 
 * @returns {Promise<boolean>} 是否可用
 */
async function testConnectivity() {
    try {
        const key = config.amap.AMAP_WEB_KEY;
        if (!key) {
            console.error('[amapService] AMAP_WEB_KEY 未配置');
            return false;
        }

        // 使用一个简单的坐标测试（故宫到王府井）
        const testOrigin = '116.397428,39.90923';
        const testDestination = '116.410876,39.911946';

        await getWalkingRoute(testOrigin, testDestination);
        console.log('[amapService] 高德 API 连通性测试通过');
        return true;

    } catch (error) {
        console.error('[amapService] 高德 API 连通性测试失败:', error.message);
        return false;
    }
}

module.exports = {
    getWalkingRoute,
    testConnectivity
};
