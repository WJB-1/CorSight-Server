/**
 * 预设路线配置
 *
 * 用于跳过高德路线规划，直接使用采样点坐标串联路线。
 * 适合天桥、盲道等高德无法规划的路段。
 */

const presetRoutes = {
  // 广州大学城：广大生活区公交站 → 体育场（经天桥）
  gzdx_stadium: {
    name: '广大生活区公交站→体育场',
    description: '广州大学城校区步行路线，经过文渊楼、天桥、教学区、体育场',
    // 按行走顺序排列的 point_id 列表
    pointIds: [
      'P_1780826776817_35872',
      'P_1780826684838_07985',
      'P_1780826603991_99026',
      'P_1780826432700_76986',
      'P_1780826357585_76628',
      'P_1780826252300_94781',
      'P_1780824813913_91315',
      'P_1780824916004_65223',
      'P_1780825181634_52497',
      'P_1780825751791_97686',
      'P_1780825864611_60164',
      'P_1780825942325_42294',
    ],
    // 标记天桥节点的 walk_type（spatialMiddleware 会将其识别为关键节点）
    // key: point_id, value: walk_type
    walkTypes: {
      'P_1780826252300_94781': 4,  // 二号天桥附近
      'P_1780824813913_91315': 4,  // 一号天桥
      'P_1780824622163_81482': 4,  // 二号天桥入口（备用）
    },
    // 起终点信息
    origin: { name: '广大生活区公交站', lat: 23.040911, lng: 113.372083 },
    destination: { name: '体育场', lat: 23.043790, lng: 113.372332 },
  },
};

/**
 * 获取预设路线列表（不含详细坐标，供前端选择）
 */
function listRoutes() {
  return Object.entries(presetRoutes).map(([key, route]) => ({
    routeId: key,
    name: route.name,
    description: route.description,
    pointCount: route.pointIds.length,
    origin: route.origin.name,
    destination: route.destination.name,
  }));
}

/**
 * 获取指定路线配置
 */
function getRoute(routeId) {
  return presetRoutes[routeId] || null;
}

module.exports = { presetRoutes, listRoutes, getRoute };
