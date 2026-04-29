/**
 * 模块四：本地存储与端云同步引擎
 * Step 3: 数据组装工坊 - DataAssembler
 * 
 * 职责：将模块三采集的原始数据（经纬度、描述、本地图片路径）
 * 组装成符合 SamplingPoint 接口的标准数据对象
 */

import type { SamplingPoint, DirectionImages, Direction } from '../types/map';
import { storageService } from '../services/storageService';

/**
 * 八方位方向常量数组
 */
const DIRECTIONS: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * 生成唯一的采样点 ID
 * 格式：Point_<timestamp>_<random>
 * 示例：Point_1678888888_A1B2
 * 
 * @returns 生成的唯一标识符
 */
function generatePointId(): string {
  const timestamp = Date.now();
  // 生成 4 位随机数/字母
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `Point_${timestamp}_${random}`;
}

/**
 * 验证本地图片路径是否有效
 * @param path 本地文件路径
 * @returns 是否有效
 */
function isValidImagePath(path: string): boolean {
  return typeof path === 'string' && 
         path.length > 0 && 
         !path.startsWith('http'); // 排除云端 URL
}

/**
 * 处理本地图片路径映射
 * 
 * 边界情况处理：
 * - 如果某个方向没有图片或路径为空，则该方向不包含在结果中
 * - 过滤掉无效的本地路径
 * - 确保所有路径都是本地临时文件路径（非 URL）
 * 
 * @param localImages 本地图片路径记录
 * @returns 处理后的 DirectionImages 对象
 */
function processLocalImages(localImages: Record<string, string>): DirectionImages {
  const images: DirectionImages = {};

  for (const direction of DIRECTIONS) {
    const path = localImages[direction];
    
    // 边界处理：路径存在且有效时才放入
    if (path && isValidImagePath(path)) {
      images[direction] = path;
    }
    // 否则该方向不包含在结果中（undefined）
  }

  return images;
}

/**
 * 创建采样点数据对象
 * 
 * 这是模块四的核心入口函数，承接模块三的输出：
 * - 模块三采集的经纬度、场景描述、8张本地图片
 * - 本函数组装为标准 SamplingPoint 格式并存入本地队列
 * 
 * @param lat 纬度（WGS84）
 * @param lon 经度（WGS84）
 * @param desc 场景文字描述
 * @param localImages 八方位本地图片路径映射，键为方向（N/NE/E/SE/S/SW/W/NW），值为临时文件路径
 * @returns 生成的采样点唯一标识符（point_id）
 * 
 * @example
 * ```typescript
 * const pointId = createSamplingPoint(
 *   23.1364,
 *   113.3223,
 *   '十字路口，有红绿灯和人行横道',
 *   {
 *     N: '_doc/uniapp_temp/compressed/photo_N.jpg',
 *     S: '_doc/uniapp_temp/compressed/photo_S.jpg',
 *     E: '_doc/uniapp_temp/compressed/photo_E.jpg'
 *   }
 * );
 * console.log(pointId); // "Point_1699123456789_AB12"
 * ```
 */
export function createSamplingPoint(
  lat: number,
  lon: number,
  desc: string,
  localImages: Record<string, string>
): string {
  console.log('[DataAssembler] 开始组装采样点数据');

  // 1. 生成唯一 ID
  const pointId = generatePointId();
  console.log(`[DataAssembler] 生成 point_id: ${pointId}`);

  // 2. 处理本地图片路径（过滤空值和无效路径）
  const processedImages = processLocalImages(localImages);
  const validImageCount = Object.keys(processedImages).length;
  console.log(`[DataAssembler] 有效图片数量: ${validImageCount}/8`);

  // 3. 组装 SamplingPoint 对象
  const samplingPoint: SamplingPoint = {
    point_id: pointId,
    coordinates: {
      longitude: lon,
      latitude: lat
    },
    scene_description: desc || '', // 处理空描述的情况
    images: processedImages,
    status: 'pending', // 默认为待上传状态
    timestamp: Date.now()
  };

  // 4. 存入本地离线队列（调用 StorageService）
  try {
    storageService.addTask(samplingPoint);
    console.log(`[DataAssembler] 采样点已存入本地队列: ${pointId}`);
  } catch (error) {
    console.error('[DataAssembler] 存入本地队列失败:', error);
    throw new Error(`创建采样点失败: ${error}`);
  }

  // 5. 返回生成的 point_id，供上层界面显示或后续操作
  return pointId;
}

/**
 * 批量创建采样点（可选工具函数）
 * 
 * 用于需要一次性创建多个采样点的场景
 * 
 * @param points 采样点原始数据数组
 * @returns 生成的 point_id 数组
 */
export function createSamplingPoints(
  points: Array<{
    lat: number;
    lon: number;
    desc: string;
    localImages: Record<string, string>;
  }>
): string[] {
  console.log(`[DataAssembler] 批量创建采样点: ${points.length} 个`);
  
  const pointIds: string[] = [];
  
  for (const point of points) {
    try {
      const id = createSamplingPoint(
        point.lat,
        point.lon,
        point.desc,
        point.localImages
      );
      pointIds.push(id);
    } catch (error) {
      console.error('[DataAssembler] 批量创建中某项失败:', error);
      // 继续处理其他项，不中断批量操作
    }
  }
  
  console.log(`[DataAssembler] 批量创建完成: ${pointIds.length}/${points.length} 成功`);
  return pointIds;
}

/**
 * 更新采样点描述
 * 
 * 用于用户在保存后想要修改场景描述的场景
 * 
 * @param point_id 采样点 ID
 * @param newDesc 新的场景描述
 */
export function updateSamplingPointDescription(
  point_id: string,
  newDesc: string
): void {
  console.log(`[DataAssembler] 更新采样点描述: ${point_id}`);
  
  try {
    storageService.updateTaskStatus(point_id, 'pending', {
      scene_description: newDesc
    });
    console.log(`[DataAssembler] 描述已更新: ${point_id}`);
  } catch (error) {
    console.error('[DataAssembler] 更新描述失败:', error);
    throw error;
  }
}

/**
 * 获取采样点统计信息（便捷函数）
 * @returns 本地队列统计
 */
export function getSamplingStats() {
  return storageService.getStats();
}

/**
 * 导出工具函数
 */
export {
  generatePointId,
  processLocalImages,
  isValidImagePath,
  DIRECTIONS
};
