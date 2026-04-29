/**
 * OSM 底图加载与服务调度器 - Map Service
 * 实现静默加载、按需拉取、防重复请求的缓存控制
 */

import * as gridManager from '../utils/gridManager';

// 后端 API 基础 URL
const API_BASE_URL = 'http://localhost:3000/api';

// 请求选项类型
interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  header?: Record<string, string>;
  data?: any;
  timeout?: number;
}

// 请求成功回调结果
interface RequestSuccessResult {
  data: any;
  statusCode: number;
  header: Record<string, string>;
  cookies?: string[];
  errMsg: string;
}

// 请求失败回调结果
interface RequestFailResult {
  errMsg: string;
  errCode?: number;
}

class MapService {
  // 私有缓存集合，记录已加载的 chunkId 避免重复请求网络
  private loadedChunks: Set<string>;
  // 正在加载中的请求（防止并发重复请求）
  private loadingChunks: Map<string, Promise<any>>;

  constructor() {
    this.loadedChunks = new Set();
    this.loadingChunks = new Map();
  }

  /**
   * 核心加载逻辑：
   * 1. 算 chunkId -> 2. 查缓存 -> 3. 命中则直接返回 null
   * -> 4. 未命中则算 BBox -> 5. 发起 uni.request 到后端 -> 6. 加入缓存并返回 GeoJSON
   * 
   * @param lat 纬度
   * @param lon 经度
   * @returns Promise<any | null> 返回 GeoJSON 数据或 null（已缓存时）
   */
  public async fetchMapDataByLocation(
    lat: number,
    lon: number
  ): Promise<any | null> {
    // Step 1: 计算 chunkId
    const tile = gridManager.getTile(lat, lon);
    const { chunkId } = tile;

    // Step 2: 查缓存
    if (this.loadedChunks.has(chunkId)) {
      console.log(`[MapService] Chunk ${chunkId} already loaded, skipping request`);
      return null; // 已缓存，直接返回 null
    }

    // 检查是否正在加载中
    if (this.loadingChunks.has(chunkId)) {
      console.log(`[MapService] Chunk ${chunkId} is loading, returning pending request`);
      return this.loadingChunks.get(chunkId) || null;
    }

    // Step 4: 未命中，计算 BBox
    const bbox = gridManager.getTileBoundingBox(tile.x, tile.y, tile.z);
    const bboxString = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;

    // Step 5: 发起请求
    const requestPromise = this.requestMapData(chunkId, bboxString);
    
    // 记录正在加载的请求
    this.loadingChunks.set(chunkId, requestPromise);

    try {
      const result = await requestPromise;
      // Step 6: 加入缓存
      this.loadedChunks.add(chunkId);
      return result;
    } finally {
      // 无论成功失败，都移除加载中标记
      this.loadingChunks.delete(chunkId);
    }
  }

  /**
   * 内部方法：发起实际的 HTTP 请求
   * @param chunkId 区块 ID
   * @param bboxString 边界框字符串
   * @returns Promise<any> GeoJSON 数据
   */
  private requestMapData(chunkId: string, bboxString: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${API_BASE_URL}/map/chunk?bbox=${encodeURIComponent(bboxString)}`;
      
      console.log(`[MapService] Fetching map data for chunk ${chunkId}: ${url}`);

      const options: RequestOptions = {
        url,
        method: 'GET',
        header: {
          'Content-Type': 'application/json',
        },
      };

      // 使用 uni.request 发起请求
      (uni as any).request({
        ...options,
        success: (res: RequestSuccessResult) => {
          if (res.statusCode === 200 && res.data) {
            console.log(`[MapService] Successfully loaded chunk ${chunkId}`);
            resolve(res.data);
          } else {
            console.error(`[MapService] Failed to load chunk ${chunkId}:`, res);
            reject(new Error(`HTTP ${res.statusCode}: ${res.errMsg || 'Unknown error'}`));
          }
        },
        fail: (err: RequestFailResult) => {
          console.error(`[MapService] Request failed for chunk ${chunkId}:`, err);
          reject(new Error(err.errMsg || 'Network request failed'));
        },
      });
    });
  }

  /**
   * 预加载九宫格数据
   * 用于用户位置变动时提前加载周围区块
   * @param lat 中心纬度
   * @param lon 中心经度
   * @returns Promise<void>
   */
  public async preloadSurroundingChunks(
    lat: number,
    lon: number
  ): Promise<void> {
    const chunkIds = gridManager.getCurrentAndSurroundingChunks(lat, lon);
    
    console.log(`[MapService] Preloading ${chunkIds.length} chunks:`, chunkIds);

    // 并发加载所有区块（但会跳过已缓存的）
    const loadPromises = chunkIds.map(async (chunkId) => {
      const parsed = gridManager.parseChunkId(chunkId);
      if (!parsed) return;

      const bbox = gridManager.getTileBoundingBox(parsed.x, parsed.y, parsed.z);
      const bboxString = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;

      // 已缓存则跳过
      if (this.loadedChunks.has(chunkId)) {
        return;
      }

      // 正在加载中也跳过
      if (this.loadingChunks.has(chunkId)) {
        return;
      }

      try {
        await this.requestMapData(chunkId, bboxString);
        this.loadedChunks.add(chunkId);
      } catch (error) {
        console.warn(`[MapService] Preload failed for chunk ${chunkId}:`, error);
        // 预加载失败不抛出错误，不影响主流程
      }
    });

    await Promise.all(loadPromises);
    console.log('[MapService] Preload completed');
  }

  /**
   * 检查指定坐标是否跨越了瓦片边界
   * 如果跨越边界，自动加载新区块的数据
   * @param prevLat 之前纬度
   * @param prevLon 之前经度
   * @param currLat 当前纬度
   * @param currLon 当前经度
   * @returns Promise<boolean> 是否跨越了边界
   */
  public async checkAndLoadOnBoundaryCross(
    prevLat: number,
    prevLon: number,
    currLat: number,
    currLon: number
  ): Promise<boolean> {
    const hasCrossed = gridManager.hasCrossedTileBoundary(
      prevLat,
      prevLon,
      currLat,
      currLon
    );

    if (hasCrossed) {
      console.log('[MapService] Tile boundary crossed, loading new chunk data');
      await this.fetchMapDataByLocation(currLat, currLon);
      // 同时预加载周围区块
      this.preloadSurroundingChunks(currLat, currLon);
      return true;
    }

    return false;
  }

  /**
   * 获取已加载的区块数量
   * @returns number
   */
  public getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }

  /**
   * 获取已加载的区块 ID 列表
   * @returns string[]
   */
  public getLoadedChunkIds(): string[] {
    return Array.from(this.loadedChunks);
  }

  /**
   * 检查指定区块是否已加载
   * @param chunkId 区块 ID
   * @returns boolean
   */
  public isChunkLoaded(chunkId: string): boolean {
    return this.loadedChunks.has(chunkId);
  }

  /**
   * 清空缓存，用于用户彻底退出地图页面时
   */
  public clearCache(): void {
    this.loadedChunks.clear();
    this.loadingChunks.clear();
    console.log('[MapService] Cache cleared');
  }

  /**
   * 强制刷新指定区块的数据
   * @param lat 纬度
   * @param lon 经度
   * @returns Promise<any>
   */
  public async refreshChunk(lat: number, lon: number): Promise<any> {
    const tile = gridManager.getTile(lat, lon);
    
    // 从缓存中移除，强制重新加载
    this.loadedChunks.delete(tile.chunkId);
    this.loadingChunks.delete(tile.chunkId);

    return this.fetchMapDataByLocation(lat, lon);
  }
}

// 导出单例
export default new MapService();
