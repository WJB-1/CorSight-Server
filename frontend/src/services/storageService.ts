/**
 * 模块四：本地存储与端云同步引擎
 * Step 2: 离线队列管理 - StorageService
 * 
 * 封装 Uni-app 本地缓存 API，管理离线街景数据队列
 * 职责：提供任务的增删改查能力，支持弱网环境下的离线采集
 */

import type { SamplingPoint, SamplingPointStatus } from '../types/map';

/**
 * 本地存储键名常量
 */
const STORAGE_KEY = 'offline_sampling_tasks';

/**
 * 存储服务类
 * 单例模式，全局唯一实例
 */
class StorageService {
  /** 单例实例 */
  private static instance: StorageService;

  /**
   * 获取单例实例
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * 私有构造函数，防止外部实例化
   */
  private constructor() {
    console.log('[StorageService] 初始化');
  }

  /**
   * 获取所有存储的采样点任务（私有方法）
   * @returns 采样点数组
   */
  private _getAllTasksRaw(): SamplingPoint[] {
    try {
      const data = uni.getStorageSync(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as SamplingPoint[];
      }
    } catch (error) {
      console.error('[StorageService] 读取存储失败:', error);
    }
    return [];
  }

  /**
   * 保存所有采样点任务到本地存储（私有方法）
   * @param tasks 采样点数组
   */
  private _saveAllTasksRaw(tasks: SamplingPoint[]): void {
    try {
      uni.setStorageSync(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('[StorageService] 保存存储失败:', error);
      throw new Error('本地存储写入失败');
    }
  }

  /**
   * 添加新任务到离线队列
   * @param point 采样点数据
   */
  public addTask(point: SamplingPoint): void {
    console.log(`[StorageService] 添加任务: ${point.point_id}`);
    
    const tasks = this._getAllTasksRaw();
    
    // 检查是否已存在相同 point_id 的任务
    const existingIndex = tasks.findIndex(t => t.point_id === point.point_id);
    
    if (existingIndex !== -1) {
      // 更新已存在的任务
      tasks[existingIndex] = {
        ...tasks[existingIndex],
        ...point,
        // 保留原有的 timestamp，除非明确传入新的
        timestamp: point.timestamp || tasks[existingIndex].timestamp
      };
      console.log(`[StorageService] 更新已存在任务: ${point.point_id}`);
    } else {
      // 添加新任务
      tasks.push(point);
      console.log(`[StorageService] 新增任务: ${point.point_id}`);
    }
    
    this._saveAllTasksRaw(tasks);
  }

  /**
   * 获取所有待上传的任务（status = 'pending'）
   * @returns 待上传的采样点数组
   */
  public getPendingTasks(): SamplingPoint[] {
    const tasks = this._getAllTasksRaw();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    console.log(`[StorageService] 获取待上传任务: ${pendingTasks.length}/${tasks.length}`);
    return pendingTasks;
  }

  /**
   * 获取所有上传中的任务（status = 'uploading'）
   * @returns 上传中的采样点数组
   */
  public getUploadingTasks(): SamplingPoint[] {
    const tasks = this._getAllTasksRaw();
    return tasks.filter(t => t.status === 'uploading');
  }

  /**
   * 获取所有已同步的任务（status = 'synced'）
   * @returns 已同步的采样点数组
   */
  public getSyncedTasks(): SamplingPoint[] {
    const tasks = this._getAllTasksRaw();
    return tasks.filter(t => t.status === 'synced');
  }

  /**
   * 获取所有任务
   * @returns 所有采样点数组
   */
  public getAllTasks(): SamplingPoint[] {
    return this._getAllTasksRaw();
  }

  /**
   * 移除指定任务
   * @param point_id 采样点唯一标识
   */
  public removeTask(point_id: string): void {
    console.log(`[StorageService] 移除任务: ${point_id}`);
    
    const tasks = this._getAllTasksRaw();
    const filteredTasks = tasks.filter(t => t.point_id !== point_id);
    
    if (filteredTasks.length < tasks.length) {
      this._saveAllTasksRaw(filteredTasks);
      console.log(`[StorageService] 任务已移除: ${point_id}`);
    } else {
      console.warn(`[StorageService] 未找到任务: ${point_id}`);
    }
  }

  /**
   * 更新任务状态
   * @param point_id 采样点唯一标识
   * @param status 新状态
   * @param extraData 可选的额外更新数据
   */
  public updateTaskStatus(
    point_id: string, 
    status: SamplingPointStatus,
    extraData?: Partial<SamplingPoint>
  ): void {
    console.log(`[StorageService] 更新任务状态: ${point_id} -> ${status}`);
    
    const tasks = this._getAllTasksRaw();
    const taskIndex = tasks.findIndex(t => t.point_id === point_id);
    
    if (taskIndex === -1) {
      console.error(`[StorageService] 未找到任务: ${point_id}`);
      throw new Error(`任务不存在: ${point_id}`);
    }
    
    // 更新状态和其他字段
    tasks[taskIndex] = {
      ...tasks[taskIndex],
      status,
      ...extraData
    };
    
    this._saveAllTasksRaw(tasks);
    console.log(`[StorageService] 任务状态已更新: ${point_id} -> ${status}`);
  }

  /**
   * 根据 ID 获取单个任务
   * @param point_id 采样点唯一标识
   * @returns 采样点数据或 undefined
   */
  public getTaskById(point_id: string): SamplingPoint | undefined {
    const tasks = this._getAllTasksRaw();
    return tasks.find(t => t.point_id === point_id);
  }

  /**
   * 清空所有任务（谨慎使用）
   */
  public clearAllTasks(): void {
    console.warn('[StorageService] 清空所有任务');
    try {
      uni.removeStorageSync(STORAGE_KEY);
    } catch (error) {
      console.error('[StorageService] 清空存储失败:', error);
      throw new Error('清空本地存储失败');
    }
  }

  /**
   * 获取存储统计信息
   */
  public getStats(): {
    total: number;
    pending: number;
    uploading: number;
    synced: number;
  } {
    const tasks = this._getAllTasksRaw();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      uploading: tasks.filter(t => t.status === 'uploading').length,
      synced: tasks.filter(t => t.status === 'synced').length
    };
  }
}

/**
 * 导出 StorageService 单例实例
 */
export const storageService = StorageService.getInstance();

/**
 * 导出类本身（便于测试和特殊场景）
 */
export { StorageService };

/**
 * 导出常量
 */
export { STORAGE_KEY };
