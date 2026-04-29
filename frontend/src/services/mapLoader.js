/**
 * 高德地图加载服务
 * 统一使用 JSAPI Loader 加载高德地图，解决 Vite 环境下的加载问题
 */

let amapInstance = null;
let loadPromise = null;

/**
 * 加载高德地图 API
 * @returns {Promise<typeof AMap>}
 */
export async function loadAMap() {
  // 如果已经加载过，直接返回
  if (amapInstance) {
    return amapInstance;
  }
  
  // 如果正在加载中，返回同一个 Promise
  if (loadPromise) {
    return loadPromise;
  }
  
  // 开始加载
  loadPromise = new Promise((resolve, reject) => {
    console.log('[MapLoader] 开始加载高德地图...');
    
    // 检查 AMapLoader 是否存在
    if (typeof AMapLoader === 'undefined') {
      reject(new Error('AMapLoader 未加载，请检查 index.html 中是否引入了 loader.js'));
      return;
    }
    
    // 使用 JSAPI Loader 加载
    AMapLoader.load({
      key: "6e760d76e5650f0f9004c5412dcfc58e",
      version: "2.0",
      plugins: ['AMap.Scale', 'AMap.ToolBar']
    })
    .then((AMap) => {
      console.log('[MapLoader] ✅ 高德地图加载成功，版本:', AMap.version);
      amapInstance = AMap;
      resolve(AMap);
    })
    .catch((error) => {
      console.error('[MapLoader] ❌ 高德地图加载失败:', error);
      reject(error);
    });
  });
  
  return loadPromise;
}

/**
 * 获取已加载的 AMap 实例
 * @returns {typeof AMap | null}
 */
export function getAMap() {
  return amapInstance;
}

/**
 * 检查高德地图是否已加载
 * @returns {boolean}
 */
export function isAMapLoaded() {
  return !!amapInstance;
}

/**
 * 等待高德地图加载完成
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<typeof AMap>}
 */
export async function waitForAMap(timeout = 30000) {
  if (amapInstance) {
    return amapInstance;
  }
  
  return Promise.race([
    loadAMap(),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`等待高德地图加载超时 (${timeout}ms)`));
      }, timeout);
    })
  ]);
}

/**
 * 重置加载状态（用于调试）
 */
export function resetLoader() {
  amapInstance = null;
  loadPromise = null;
}
