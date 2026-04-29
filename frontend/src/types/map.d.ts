/**
 * 模块四：本地存储与端云同步引擎
 * Step 1: 数据契约 - TypeScript 类型定义
 * 
 * 定义采样点数据结构，用于前端离线存储和与后端模块五的数据交换
 */

/**
 * 采样点状态枚举
 * - pending: 待上传
 * - uploading: 上传中
 * - synced: 已同步
 */
export type SamplingPointStatus = 'pending' | 'uploading' | 'synced';

/**
 * 八方位方向类型
 */
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * 坐标接口
 */
export interface Coordinates {
  /** 经度 */
  longitude: number;
  /** 纬度 */
  latitude: number;
}

/**
 * 八方位图片映射
 * 键为方向，值为本地路径或云端 URL
 */
export interface DirectionImages {
  /** 北 */
  N?: string;
  /** 东北 */
  NE?: string;
  /** 东 */
  E?: string;
  /** 东南 */
  SE?: string;
  /** 南 */
  S?: string;
  /** 西南 */
  SW?: string;
  /** 西 */
  W?: string;
  /** 西北 */
  NW?: string;
}

/**
 * 采样点数据接口
 * 
 * 兼容性说明：
 * - 存储于前端本地 Storage 时，images 中存放本地临时文件路径
 * - 上传给后端模块五时，images 中必须是已上传成功的云端 URL
 */
export interface SamplingPoint {
  /** 
   * 唯一标识 
   * 格式：Point_<timestamp>_<random>
   * 示例：Point_1678888888_A1B2
   */
  point_id: string;

  /** 地理坐标（WGS84） */
  coordinates: Coordinates;

  /** 场景文字描述（可选） */
  scene_description?: string;

  /** 
   * 八方位图片映射
   * - 本地存储时：值为临时文件路径（如 '_doc/uniapp_temp/compressed/xxx.jpg'）
   * - 同步后端时：值为云端 URL（如 'https://api.example.com/images/xxx.jpg'）
   */
  images: DirectionImages;

  /** 
   * 同步状态
   * @default 'pending'
   */
  status: SamplingPointStatus;

  /** 
   * 创建时间戳（Unix 毫秒）
   * 用于排序和去重
   */
  timestamp: number;
}

/**
 * 图片上传结果
 */
export interface ImageUploadResult {
  /** 方向 */
  direction: Direction;
  /** 本地原路径 */
  localPath: string;
  /** 云端 URL（上传成功时） */
  remoteUrl?: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 同步任务结果
 */
export interface SyncTaskResult {
  /** 采样点 ID */
  point_id: string;
  /** 是否整体成功 */
  success: boolean;
  /** 图片上传结果列表 */
  imageResults?: ImageUploadResult[];
  /** 后端响应数据 */
  serverResponse?: any;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 同步配置选项
 */
export interface SyncOptions {
  /** 后端基础 URL */
  baseUrl: string;
  /** 图片上传接口路径 */
  imageUploadEndpoint?: string;
  /** 采样点数据上传接口路径 */
  samplingPointEndpoint?: string;
  /** 最大并发上传数 */
  maxConcurrentUploads?: number;
  /** 请求超时时间（毫秒） */
  timeout?: number;
}

declare global {
  /**
   * 扩展 UniApp 类型
   * 确保 uni 对象在 TypeScript 中可用
   */
  const uni: UniApp.Uni;
}

export {};
