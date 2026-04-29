/**
 * 模块四：本地存储与端云同步引擎
 * Step 4: 同步引擎与垃圾回收 - SyncService
 * 
 * 职责：将本地离线数据同步到后端 MongoDB（兼容模块五）
 * 核心功能：
 * 1. 并发上传图片到云端
 * 2. 数据契约转换（本地路径 -> 云端 URL）
 * 3. 完整 JSON 上传到后端 /api/upload/sampling_point
 * 4. 垃圾回收：清理本地记录和物理文件
 * 5. 失败重试机制
 */

import type { 
  SamplingPoint, 
  DirectionImages, 
  ImageUploadResult, 
  SyncTaskResult,
  Direction 
} from '../types/map';
import { storageService } from './storageService';

/**
 * 后端 API 配置
 * 可根据实际部署环境修改
 */
const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3000';
const IMAGE_UPLOAD_ENDPOINT = '/api/upload/image';
const SAMPLING_POINT_ENDPOINT = '/api/upload/sampling_point';

/**
 * 同步服务类
 * 单例模式，全局唯一实例
 */
class SyncService {
  /** 单例实例 */
  private static instance: SyncService;
  
  /** 是否正在同步中 */
  private isSyncing: boolean = false;
  
  /** 最大并发上传数 */
  private maxConcurrentUploads: number = 3;

  /**
   * 获取单例实例
   */
  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    console.log('[SyncService] 初始化');
  }

  /**
   * 上传单张图片到服务器
   * 
   * @param localPath 本地图片路径
   * @param direction 图片方向（用于标识）
   * @returns 上传结果
   */
  private async uploadSingleImage(
    localPath: string, 
    direction: Direction
  ): Promise<ImageUploadResult> {
    console.log(`[SyncService] 开始上传图片: ${direction} -> ${localPath}`);

    return new Promise((resolve) => {
      uni.uploadFile({
        url: `${API_BASE_URL}${IMAGE_UPLOAD_ENDPOINT}`,
        filePath: localPath,
        name: 'image',
        formData: {
          direction: direction
        },
        timeout: 30000, // 30秒超时
        success: (res: any) => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data);
              if (data.success && data.url) {
                console.log(`[SyncService] 图片上传成功: ${direction}`);
                resolve({
                  direction,
                  localPath,
                  remoteUrl: data.url,
                  success: true
                });
              } else {
                throw new Error(data.message || '上传失败');
              }
            } catch (error) {
              console.error(`[SyncService] 解析响应失败: ${direction}`, error);
              resolve({
                direction,
                localPath,
                success: false,
                error: '解析响应失败'
              });
            }
          } else {
            console.error(`[SyncService] 上传失败: ${direction}, 状态码: ${res.statusCode}`);
            resolve({
              direction,
              localPath,
              success: false,
              error: `HTTP ${res.statusCode}`
            });
          }
        },
        fail: (err: any) => {
          console.error(`[SyncService] 上传失败: ${direction}`, err);
          resolve({
            direction,
            localPath,
            success: false,
            error: err.errMsg || '网络请求失败'
          });
        }
      });
    });
  }

  /**
   * 并发上传所有图片
   * 
   * @param images 本地图片映射
   * @returns 上传结果数组
   */
  private async uploadImagesConcurrently(
    images: DirectionImages
  ): Promise<ImageUploadResult[]> {
    const entries = Object.entries(images).filter(([, path]) => !!path) as [Direction, string][];
    
    console.log(`[SyncService] 准备上传 ${entries.length} 张图片`);

    // 使用 Promise.all 并发上传
    const uploadPromises = entries.map(([direction, path]) => 
      this.uploadSingleImage(path, direction)
    );

    const results = await Promise.all(uploadPromises);
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[SyncService] 图片上传完成: ${successCount}/${results.length} 成功`);
    
    return results;
  }

  /**
   * 构建云端图片映射
   * 
   * 将上传成功的结果转换为 DirectionImages 格式
   * 
   * @param results 上传结果数组
   * @returns 云端 URL 映射
   */
  private buildRemoteImageMap(results: ImageUploadResult[]): DirectionImages {
    const remoteImages: DirectionImages = {};
    
    for (const result of results) {
      if (result.success && result.remoteUrl) {
        remoteImages[result.direction] = result.remoteUrl;
      }
    }
    
    return remoteImages;
  }

  /**
   * 上传采样点完整数据到后端
   * 
   * @param point 采样点数据（包含云端图片 URL）
   * @returns 是否成功
   */
  private async uploadSamplingPointData(point: SamplingPoint): Promise<boolean> {
    console.log(`[SyncService] 上传采样点数据: ${point.point_id}`);

    return new Promise((resolve) => {
      uni.request({
        url: `${API_BASE_URL}${SAMPLING_POINT_ENDPOINT}`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json'
        },
        data: {
          point_id: point.point_id,
          coordinates: point.coordinates,
          scene_description: point.scene_description,
          images: point.images,
          timestamp: point.timestamp
        },
        timeout: 30000,
        success: (res: any) => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`[SyncService] 采样点数据上传成功: ${point.point_id}`);
            resolve(true);
          } else {
            console.error(`[SyncService] 采样点数据上传失败: ${point.point_id}, 状态码: ${res.statusCode}`);
            resolve(false);
          }
        },
        fail: (err: any) => {
          console.error(`[SyncService] 采样点数据上传失败: ${point.point_id}`, err);
          resolve(false);
        }
      });
    });
  }

  /**
   * 删除本地物理文件（垃圾回收）
   * 
   * @param localPaths 本地文件路径数组
   */
  private deleteLocalFiles(localPaths: string[]): void {
    console.log(`[SyncService] 开始垃圾回收，删除 ${localPaths.length} 个本地文件`);

    const fsManager = uni.getFileSystemManager();

    for (const path of localPaths) {
      try {
        fsManager.unlink({
          filePath: path,
          success: () => {
            console.log(`[SyncService] 已删除本地文件: ${path}`);
          },
          fail: (err: any) => {
            // 捕获 unlink 异常，不中断流程
            console.warn(`[SyncService] 删除文件失败（可忽略）: ${path}`, err);
          }
        });
      } catch (error) {
        // 捕获同步异常
        console.warn(`[SyncService] 删除文件异常（可忽略）: ${path}`, error);
      }
    }
  }

  /**
   * 同步单个采样点任务
   * 
   * @param point 待同步的采样点
   * @returns 同步结果
   */
  private async syncSingleTask(point: SamplingPoint): Promise<SyncTaskResult> {
    const originalLocalPaths: string[] = [];
    
    try {
      // 1. 更新状态为 uploading
      storageService.updateTaskStatus(point.point_id, 'uploading');

      // 2. 收集原始本地路径（用于后续垃圾回收）
      for (const [, path] of Object.entries(point.images)) {
        if (path && !path.startsWith('http')) {
          originalLocalPaths.push(path);
        }
      }

      // 3. 并发上传所有图片
      const imageResults = await this.uploadImagesConcurrently(point.images);

      // 4. 检查是否所有图片都上传成功
      const allImagesSuccess = imageResults.every(r => r.success);
      if (!allImagesSuccess) {
        // 有图片上传失败，标记任务为 pending 等待重试
        const failedDirections = imageResults
          .filter(r => !r.success)
          .map(r => r.direction)
          .join(', ');
        console.warn(`[SyncService] 部分图片上传失败: ${failedDirections}`);
        
        storageService.updateTaskStatus(point.point_id, 'pending');
        return {
          point_id: point.point_id,
          success: false,
          imageResults,
          error: `图片上传失败: ${failedDirections}`
        };
      }

      // 5. 数据契约转换：构建云端图片映射
      const remoteImages = this.buildRemoteImageMap(imageResults);

      // 6. 构建完整采样点数据（替换本地路径为云端 URL）
      const pointWithRemoteImages: SamplingPoint = {
        ...point,
        images: remoteImages,
        status: 'synced'
      };

      // 7. 上传完整 JSON 到后端（兼容模块五）
      const uploadSuccess = await this.uploadSamplingPointData(pointWithRemoteImages);

      if (!uploadSuccess) {
        // 后端接收失败，回滚状态为 pending
        storageService.updateTaskStatus(point.point_id, 'pending');
        return {
          point_id: point.point_id,
          success: false,
          imageResults,
          error: '后端数据接收失败'
        };
      }

      // 8. 垃圾回收 (GC)
      // 8.1 删除本地存储记录
      storageService.removeTask(point.point_id);
      console.log(`[SyncService] 已移除本地记录: ${point.point_id}`);

      // 8.2 删除本地物理文件
      this.deleteLocalFiles(originalLocalPaths);

      return {
        point_id: point.point_id,
        success: true,
        imageResults
      };

    } catch (error) {
      // 发生异常，回滚状态为 pending 等待下次重试
      console.error(`[SyncService] 同步任务异常: ${point.point_id}`, error);
      
      try {
        storageService.updateTaskStatus(point.point_id, 'pending');
      } catch (e) {
        // 忽略状态更新失败的错误
      }

      return {
        point_id: point.point_id,
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 同步所有待上传的任务
   * 
   * 这是模块四的核心入口方法，供业务层调用。
   * 建议在网络状态良好时调用（如 WiFi 连接、用户点击"同步"按钮时）。
   * 
   * @returns 同步结果数组
   * 
   * @example
   * ```typescript
   * // 在页面中调用
   * async function handleSync() {
   *   const results = await syncService.syncPendingTasks();
   *   const successCount = results.filter(r => r.success).length;
   *   uni.showToast({ title: `同步完成: ${successCount} 个成功` });
   * }
   * ```
   */
  public async syncPendingTasks(): Promise<SyncTaskResult[]> {
    // 防止并发调用
    if (this.isSyncing) {
      console.warn('[SyncService] 同步正在进行中，请勿重复调用');
      throw new Error('同步正在进行中');
    }

    this.isSyncing = true;
    console.log('[SyncService] 开始同步任务');

    try {
      // 1. 获取所有待上传任务
      const pendingTasks = storageService.getPendingTasks();
      
      if (pendingTasks.length === 0) {
        console.log('[SyncService] 没有待上传的任务');
        return [];
      }

      console.log(`[SyncService] 发现 ${pendingTasks.length} 个待上传任务`);

      // 2. 依次处理每个任务（串行处理，避免服务器压力过大）
      const results: SyncTaskResult[] = [];
      
      for (const task of pendingTasks) {
        console.log(`[SyncService] 处理任务 ${results.length + 1}/${pendingTasks.length}: ${task.point_id}`);
        const result = await this.syncSingleTask(task);
        results.push(result);
      }

      // 3. 输出统计
      const successCount = results.filter(r => r.success).length;
      console.log(`[SyncService] 同步完成: ${successCount}/${results.length} 成功`);

      return results;

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 检查是否正在同步
   */
  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * 设置最大并发上传数
   */
  public setMaxConcurrentUploads(max: number): void {
    this.maxConcurrentUploads = Math.max(1, Math.min(max, 8));
    console.log(`[SyncService] 设置最大并发数: ${this.maxConcurrentUploads}`);
  }

  /**
   * 手动重试失败的图片上传（可选功能）
   * 
   * @param point_id 采样点 ID
   * @param failedDirections 失败的方向列表
   */
  public async retryFailedImages(
    point_id: string, 
    failedDirections: Direction[]
  ): Promise<ImageUploadResult[]> {
    const point = storageService.getTaskById(point_id);
    if (!point) {
      throw new Error(`任务不存在: ${point_id}`);
    }

    const results: ImageUploadResult[] = [];

    for (const direction of failedDirections) {
      const path = point.images[direction];
      if (path) {
        const result = await this.uploadSingleImage(path, direction);
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * 导出 SyncService 单例实例
 */
export const syncService = SyncService.getInstance();

/**
 * 导出类本身（便于测试和特殊场景）
 */
export { SyncService };

/**
 * 导出配置常量
 */
export { API_BASE_URL, IMAGE_UPLOAD_ENDPOINT, SAMPLING_POINT_ENDPOINT };
