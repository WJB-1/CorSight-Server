/**
 * 服务层统一导出入口
 *
 * 包含模块：
 * - 模块一、二：网格管理与地图服务
 * - 模块四：本地存储与端云同步引擎
 *
 * 使用示例：
 * ```typescript
 * import {
 *   mapService,           // 模块二：地图服务
 *   storageService,       // 模块四：存储服务
 *   syncService,          // 模块四：同步服务
 *   createSamplingPoint,  // 模块四：数据组装
 *   gridManager           // 模块一：网格管理
 * } from '@/services';
 *
 * // ===== 模块一、二使用示例 =====
 * // 1. 获取当前位置所在区块
 * const tile = gridManager.getTile(lat, lon);
 * console.log('当前区块:', tile.chunkId); // "16_53943_27755"
 *
 * // 2. 加载地图数据（自动缓存）
 * const geoJSON = await mapService.fetchMapDataByLocation(lat, lon);
 *
 * // 3. 预加载九宫格
 * await mapService.preloadSurroundingChunks(lat, lon);
 *
 * // ===== 模块四使用示例 =====
 * // 4. 创建采样点（模块三调用）
 * const pointId = createSamplingPoint(lat, lon, desc, localImages);
 *
 * // 5. 同步到云端（网络可用时调用）
 * const results = await syncService.syncPendingTasks();
 * ```
 */

// ===== 模块一、二：网格管理与地图服务 =====
export { default as mapService } from './mapService';
export * as gridManager from '../utils/gridManager';

// ===== 模块四：存储与同步服务 =====
export { storageService, StorageService, STORAGE_KEY } from './storageService';
export { syncService, SyncService, API_BASE_URL } from './syncService';

// 数据组装工具
export {
  createSamplingPoint,
  createSamplingPoints,
  updateSamplingPointDescription,
  getSamplingStats,
  generatePointId,
  processLocalImages,
  isValidImagePath,
  DIRECTIONS
} from '../utils/dataAssembler';

// 类型定义
export type {
  SamplingPoint,
  SamplingPointStatus,
  Direction,
  Coordinates,
  DirectionImages,
  ImageUploadResult,
  SyncTaskResult,
  SyncOptions
} from '../types/map';
