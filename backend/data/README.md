# 街景数据导入指南

## 问题描述

前端地图显示正常，但看不到街景标记（蓝色采样点）。

**根本原因**: navigation_agent 的 MongoDB 数据库是空的，没有街景采样点数据。

**解决方案**: 从 Blind_map 项目导入街景数据到 navigation_agent 数据库。

---

## 导入步骤

### 1. 确保 MongoDB 已启动

```bash
# 检查 MongoDB 服务状态
net start MongoDB

# 如果未启动，启动服务
net start MongoDB
```

### 2. 运行导入脚本

在 `navigation_agent/backend` 目录下执行：

```bash
cd navigation_agent/backend

# 方式一：直接运行（推荐）
node data/import_from_blindmap.js

# 方式二：清空现有数据后导入（如果需要重新导入）
node data/import_from_blindmap.js --clear
```

### 3. 验证导入结果

脚本会自动测试查询功能，你应该看到类似输出：

```
✅ 导入成功: P001 (113.3225, 23.136389)
✅ 导入成功: P002 (113.324444, 23.136111)
...

📈 导入统计:
   成功导入: 32
   跳过重复: 0
   导入失败: 0

🧪 测试查询功能...
📍 测试坐标: (23.136389, 113.3225)
🔍 搜索半径: 500 米

✅ 查询成功，找到 3 个采样点:
   - P001: (23.136389, 113.3225)
   - P002: (23.136111, 113.324444)
   ...
```

### 4. 刷新前端页面

导入完成后，刷新浏览器页面，地图上应该能看到蓝色的街景标记了。

---

## 数据结构映射

### Blind_map 格式
```json
{
  "point_id": "P001",
  "coordinates": {
    "longitude": 113.322500,
    "latitude": 23.136389
  },
  "scene_description": "",
  "images": {
    "N": "images/P001_N.jpg",
    "NE": "images/P001_NE.jpg",
    ...
  }
}
```

### MongoDB 格式 (navigation_agent)
```javascript
{
  point_id: "P001",
  coordinates: {
    type: "Point",
    coordinates: [113.322500, 23.136389]  // [longitude, latitude]
  },
  scene_description: "",
  images: {
    N: "images/P001_N.jpg",
    NE: "images/P001_NE.jpg",
    ...
  },
  status: "synced"
}
```

---

## 常见问题

### Q: 导入失败，提示找不到 Blind_map 项目？
A: 确保项目目录结构正确：
```
CorSight_Navigation/
├── navigation_agent/
├── Blind_map/           <-- 必须存在
└── ...
```

### Q: 导入成功但地图仍不显示标记？
A: 检查以下几点：
1. 浏览器控制台是否有 API 请求错误
2. 地图中心点是否在采样点附近（广州天河区）
3. 尝试拖拽地图，触发 moveend 事件重新加载

### Q: 如何查看数据库中的数据？
A: 使用 MongoDB Compass 或命令行：
```bash
mongo
use corsight_navigation
db.samplingpoints.find().pretty()
```

---

## 模块 2.3 验收标准

导入数据后，应该满足以下验收标准：

- [x] **动态加载**: 地图拖拽后触发 `GET /api/navigation/nearby?lat=...&lon=...` 请求
- [x] **视觉标记**: 后端返回的采样点以蓝色标记渲染在地图上
- [x] **街景弹窗**: 点击蓝色标记能弹出 StreetViewModal，显示 scene_description 和 8 方位图片

---

**最后更新**: 2024-03-24
