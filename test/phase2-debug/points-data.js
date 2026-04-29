/**
 * 街景采样点数据 - 从 Blind_map/backend/public/map_data.json 导入
 * 共 33 个采样点
 * 图片通过 Blind_map 后端服务提供: http://localhost:3001/images/
 * 注意: public 目录下的文件直接通过根路径访问
 * 端口 3001 (避免与 navigation_agent 前端冲突)
 */
const STREET_VIEW_POINTS = [
  {
    "point_id": "P001",
    "coordinates": {
      "longitude": 113.322500,
      "latitude": 23.136389
    },
    "scene_description": "天河城东侧人行道",
    "images": {
      "N": "http://localhost:3001/images/P001_N.jpg",
      "NE": "http://localhost:3001/images/P001_NE.jpg",
      "E": "http://localhost:3001/images/P001_E.jpg",
      "SE": "http://localhost:3001/images/P001_SE.jpg",
      "S": "http://localhost:3001/images/P001_S.jpg",
      "SW": "http://localhost:3001/images/P001_SW.jpg",
      "W": "http://localhost:3001/images/P001_W.jpg",
      "NW": "http://localhost:3001/images/P001_NW.jpg"
    }
  },
  {
    "point_id": "P002",
    "coordinates": {
      "longitude": 113.324444,
      "latitude": 23.136111
    },
    "scene_description": "天河路体育中心西门附近",
    "images": {
      "N": "http://localhost:3001/images/P002_N.jpg",
      "NE": "http://localhost:3001/images/P002_NE.jpg",
      "E": "http://localhost:3001/images/P002_E.jpg",
      "SE": "http://localhost:3001/images/P002_SE.jpg",
      "S": "http://localhost:3001/images/P002_S.jpg",
      "SW": "http://localhost:3001/images/P002_SW.jpg",
      "W": "http://localhost:3001/images/P002_W.jpg",
      "NW": "http://localhost:3001/images/P002_NW.jpg"
    }
  },
  {
    "point_id": "P003",
    "coordinates": {
      "longitude": 113.325000,
      "latitude": 23.135556
    },
    "scene_description": "天河体育中心南门",
    "images": {
      "N": "http://localhost:3001/images/P003_N.jpg",
      "NE": "http://localhost:3001/images/P003_NE.jpg",
      "E": "http://localhost:3001/images/P003_E.jpg",
      "SE": "http://localhost:3001/images/P003_SE.jpg",
      "S": "http://localhost:3001/images/P003_S.jpg",
      "SW": "http://localhost:3001/images/P003_SW.jpg",
      "W": "http://localhost:3001/images/P003_W.jpg",
      "NW": "http://localhost:3001/images/P003_NW.jpg"
    }
  },
  {
    "point_id": "P004",
    "coordinates": {
      "longitude": 113.325278,
      "latitude": 23.136111
    },
    "scene_description": "体育中心东门",
    "images": {
      "N": "http://localhost:3001/images/P004_N.jpg",
      "NE": "http://localhost:3001/images/P004_NE.jpg",
      "E": "http://localhost:3001/images/P004_E.jpg",
      "SE": "http://localhost:3001/images/P004_SE.jpg",
      "S": "http://localhost:3001/images/P004_S.jpg",
      "SW": "http://localhost:3001/images/P004_SW.jpg",
      "W": "http://localhost:3001/images/P004_W.jpg",
      "NW": "http://localhost:3001/images/P004_NW.jpg"
    }
  },
  {
    "point_id": "P005",
    "coordinates": {
      "longitude": 113.328056,
      "latitude": 23.136111
    },
    "scene_description": "天河体育中心北门",
    "images": {
      "N": "http://localhost:3001/images/P005_N.jpg",
      "NE": "http://localhost:3001/images/P005_NE.jpg",
      "E": "http://localhost:3001/images/P005_E.jpg",
      "SE": "http://localhost:3001/images/P005_SE.jpg",
      "S": "http://localhost:3001/images/P005_S.jpg",
      "SW": "http://localhost:3001/images/P005_SW.jpg",
      "W": "http://localhost:3001/images/P005_W.jpg",
      "NW": "http://localhost:3001/images/P005_NW.jpg"
    }
  },
  {
    "point_id": "P006",
    "coordinates": {
      "longitude": 113.328889,
      "latitude": 23.135556
    },
    "scene_description": "体育中心东北角",
    "images": {
      "N": "http://localhost:3001/images/P006_N.jpg",
      "NE": "http://localhost:3001/images/P006_NE.jpg",
      "E": "http://localhost:3001/images/P006_E.jpg",
      "SE": "http://localhost:3001/images/P006_SE.jpg",
      "S": "http://localhost:3001/images/P006_S.jpg",
      "SW": "http://localhost:3001/images/P006_SW.jpg",
      "W": "http://localhost:3001/images/P006_W.jpg",
      "NW": "http://localhost:3001/images/P006_NW.jpg"
    }
  },
  {
    "point_id": "P007",
    "coordinates": {
      "longitude": 113.329722,
      "latitude": 23.135833
    },
    "scene_description": "体育东路与天河北路交界",
    "images": {
      "N": "http://localhost:3001/images/P007_N.jpg",
      "NE": "http://localhost:3001/images/P007_NE.jpg",
      "E": "http://localhost:3001/images/P007_E.jpg",
      "SE": "http://localhost:3001/images/P007_SE.jpg",
      "S": "http://localhost:3001/images/P007_S.jpg",
      "SW": "http://localhost:3001/images/P007_SW.jpg",
      "W": "http://localhost:3001/images/P007_W.jpg",
      "NW": "http://localhost:3001/images/P007_NW.jpg"
    }
  },
  {
    "point_id": "P008",
    "coordinates": {
      "longitude": 113.330278,
      "latitude": 23.135833
    },
    "scene_description": "林和西路人行道",
    "images": {
      "N": "http://localhost:3001/images/P008_N.jpg",
      "NE": "http://localhost:3001/images/P008_NE.jpg",
      "E": "http://localhost:3001/images/P008_E.jpg",
      "SE": "http://localhost:3001/images/P008_SE.jpg",
      "S": "http://localhost:3001/images/P008_S.jpg",
      "SW": "http://localhost:3001/images/P008_SW.jpg",
      "W": "http://localhost:3001/images/P008_W.jpg",
      "NW": "http://localhost:3001/images/P008_NW.jpg"
    }
  },
  {
    "point_id": "P009",
    "coordinates": {
      "longitude": 113.330833,
      "latitude": 23.135833
    },
    "scene_description": "林和西路与广州大道交界",
    "images": {
      "N": "http://localhost:3001/images/P009_N.jpg",
      "NE": "http://localhost:3001/images/P009_NE.jpg",
      "E": "http://localhost:3001/images/P009_E.jpg",
      "SE": "http://localhost:3001/images/P009_SE.jpg",
      "S": "http://localhost:3001/images/P009_S.jpg",
      "SW": "http://localhost:3001/images/P009_SW.jpg",
      "W": "http://localhost:3001/images/P009_W.jpg",
      "NW": "http://localhost:3001/images/P009_NW.jpg"
    }
  },
  {
    "point_id": "P010",
    "coordinates": {
      "longitude": 113.332222,
      "latitude": 23.136389
    },
    "scene_description": "广州大道北段",
    "images": {
      "N": "http://localhost:3001/images/P010_N.jpg",
      "NE": "http://localhost:3001/images/P010_NE.jpg",
      "E": "http://localhost:3001/images/P010_E.jpg",
      "SE": "http://localhost:3001/images/P010_SE.jpg",
      "S": "http://localhost:3001/images/P010_S.jpg",
      "SW": "http://localhost:3001/images/P010_SW.jpg",
      "W": "http://localhost:3001/images/P010_W.jpg",
      "NW": "http://localhost:3001/images/P010_NW.jpg"
    }
  },
  {
    "point_id": "P011",
    "coordinates": {
      "longitude": 113.333611,
      "latitude": 23.136944
    },
    "scene_description": "广州大道与天河路交界",
    "images": {
      "N": "http://localhost:3001/images/P011_N.jpg",
      "NE": "http://localhost:3001/images/P011_NE.jpg",
      "E": "http://localhost:3001/images/P011_E.jpg",
      "SE": "http://localhost:3001/images/P011_SE.jpg",
      "S": "http://localhost:3001/images/P011_S.jpg",
      "SW": "http://localhost:3001/images/P011_SW.jpg",
      "W": "http://localhost:3001/images/P011_W.jpg",
      "NW": "http://localhost:3001/images/P011_NW.jpg"
    }
  },
  {
    "point_id": "P012",
    "coordinates": {
      "longitude": 113.334722,
      "latitude": 23.137500
    },
    "scene_description": "天河立交附近",
    "images": {
      "N": "http://localhost:3001/images/P012_N.jpg",
      "NE": "http://localhost:3001/images/P012_NE.jpg",
      "E": "http://localhost:3001/images/P012_E.jpg",
      "SE": "http://localhost:3001/images/P012_SE.jpg",
      "S": "http://localhost:3001/images/P012_S.jpg",
      "SW": "http://localhost:3001/images/P012_SW.jpg",
      "W": "http://localhost:3001/images/P012_W.jpg",
      "NW": "http://localhost:3001/images/P012_NW.jpg"
    }
  },
  {
    "point_id": "P013",
    "coordinates": {
      "longitude": 113.336667,
      "latitude": 23.138056
    },
    "scene_description": "广州大道中",
    "images": {
      "N": "http://localhost:3001/images/P013_N.jpg",
      "NE": "http://localhost:3001/images/P013_NE.jpg",
      "E": "http://localhost:3001/images/P013_E.jpg",
      "SE": "http://localhost:3001/images/P013_SE.jpg",
      "S": "http://localhost:3001/images/P013_S.jpg",
      "SW": "http://localhost:3001/images/P013_SW.jpg",
      "W": "http://localhost:3001/images/P013_W.jpg",
      "NW": "http://localhost:3001/images/P013_NW.jpg"
    }
  },
  {
    "point_id": "P014",
    "coordinates": {
      "longitude": 113.339167,
      "latitude": 23.139167
    },
    "scene_description": "珠江新城北部",
    "images": {
      "N": "http://localhost:3001/images/P014_N.jpg",
      "NE": "http://localhost:3001/images/P014_NE.jpg",
      "E": "http://localhost:3001/images/P014_E.jpg",
      "SE": "http://localhost:3001/images/P014_SE.jpg",
      "S": "http://localhost:3001/images/P014_S.jpg",
      "SW": "http://localhost:3001/images/P014_SW.jpg",
      "W": "http://localhost:3001/images/P014_W.jpg",
      "NW": "http://localhost:3001/images/P014_NW.jpg"
    }
  },
  {
    "point_id": "P015",
    "coordinates": {
      "longitude": 113.322778,
      "latitude": 23.137222
    },
    "scene_description": "体育中心地铁站D1口盲道分叉",
    "images": {
      "N": "http://localhost:3001/images/P015_N.jpg",
      "NE": "http://localhost:3001/images/P015_NE.jpg",
      "E": "http://localhost:3001/images/P015_E.jpg",
      "SE": "http://localhost:3001/images/P015_SE.jpg",
      "S": "http://localhost:3001/images/P015_S.jpg",
      "SW": "http://localhost:3001/images/P015_SW.jpg",
      "W": "http://localhost:3001/images/P015_W.jpg",
      "NW": "http://localhost:3001/images/P015_NW.jpg"
    }
  },
  {
    "point_id": "P016",
    "coordinates": {
      "longitude": 113.322778,
      "latitude": 23.135833
    },
    "scene_description": "天河南街道天河路广东外经贸大厦附近",
    "images": {
      "N": "http://localhost:3001/images/P016_N.jpg",
      "NE": "http://localhost:3001/images/P016_NE.jpg",
      "E": "http://localhost:3001/images/P016_E.jpg",
      "SE": "http://localhost:3001/images/P016_SE.jpg",
      "S": "http://localhost:3001/images/P016_S.jpg",
      "SW": "http://localhost:3001/images/P016_SW.jpg",
      "W": "http://localhost:3001/images/P016_W.jpg",
      "NW": "http://localhost:3001/images/P016_NW.jpg"
    }
  },
  {
    "point_id": "P017",
    "coordinates": {
      "longitude": 113.322778,
      "latitude": 23.135000
    },
    "scene_description": "天河南街道在广晟大厦附近",
    "images": {
      "N": "http://localhost:3001/images/P017_N.jpg",
      "NE": "http://localhost:3001/images/P017_NE.jpg",
      "E": "http://localhost:3001/images/P017_E.jpg",
      "SE": "http://localhost:3001/images/P017_SE.jpg",
      "S": "http://localhost:3001/images/P017_S.jpg",
      "SW": "http://localhost:3001/images/P017_SW.jpg",
      "W": "http://localhost:3001/images/P017_W.jpg",
      "NW": "http://localhost:3001/images/P017_NW.jpg"
    }
  },
  {
    "point_id": "P018",
    "coordinates": {
      "longitude": 113.322778,
      "latitude": 23.133611
    },
    "scene_description": "天河南街道正佳广场附近",
    "images": {
      "N": "http://localhost:3001/images/P018_N.jpg",
      "NE": "http://localhost:3001/images/P018_NE.jpg",
      "E": "http://localhost:3001/images/P018_E.jpg",
      "SE": "http://localhost:3001/images/P018_SE.jpg",
      "S": "http://localhost:3001/images/P018_S.jpg",
      "SW": "http://localhost:3001/images/P018_SW.jpg",
      "W": "http://localhost:3001/images/P018_W.jpg",
      "NW": "http://localhost:3001/images/P018_NW.jpg"
    }
  },
  {
    "point_id": "P019",
    "coordinates": {
      "longitude": 113.322500,
      "latitude": 23.130556
    },
    "scene_description": "天河南街道在体育西小区南区附近",
    "images": {
      "N": "http://localhost:3001/images/P019_N.jpg",
      "NE": "http://localhost:3001/images/P019_NE.jpg",
      "E": "http://localhost:3001/images/P019_E.jpg",
      "SE": "http://localhost:3001/images/P019_SE.jpg",
      "S": "http://localhost:3001/images/P019_S.jpg",
      "SW": "http://localhost:3001/images/P019_SW.jpg",
      "W": "http://localhost:3001/images/P019_W.jpg",
      "NW": "http://localhost:3001/images/P019_NW.jpg"
    }
  },
  {
    "point_id": "P020",
    "coordinates": {
      "longitude": 113.322222,
      "latitude": 23.128889
    },
    "scene_description": "冼村街道在恒大中心附近",
    "images": {
      "N": "http://localhost:3001/images/P020_N.jpg",
      "NE": "http://localhost:3001/images/P020_NE.jpg",
      "E": "http://localhost:3001/images/P020_E.jpg",
      "SE": "http://localhost:3001/images/P020_SE.jpg",
      "S": "http://localhost:3001/images/P020_S.jpg",
      "SW": "http://localhost:3001/images/P020_SW.jpg",
      "W": "http://localhost:3001/images/P020_W.jpg",
      "NW": "http://localhost:3001/images/P020_NW.jpg"
    }
  },
  {
    "point_id": "P021",
    "coordinates": {
      "longitude": 113.322222,
      "latitude": 23.128611
    },
    "scene_description": "冼村街道在恒大中心附近",
    "images": {
      "N": "http://localhost:3001/images/P021_N.jpg",
      "NE": "http://localhost:3001/images/P021_NE.jpg",
      "E": "http://localhost:3001/images/P021_E.jpg",
      "SE": "http://localhost:3001/images/P021_SE.jpg",
      "S": "http://localhost:3001/images/P021_S.jpg",
      "SW": "http://localhost:3001/images/P021_SW.jpg",
      "W": "http://localhost:3001/images/P021_W.jpg",
      "NW": "http://localhost:3001/images/P021_NW.jpg"
    }
  },
  {
    "point_id": "P022",
    "coordinates": {
      "longitude": 113.322500,
      "latitude": 23.127778
    },
    "scene_description": "冼村街道在维家思广场附近",
    "images": {
      "N": "http://localhost:3001/images/P022_N.jpg",
      "NE": "http://localhost:3001/images/P022_NE.jpg",
      "E": "http://localhost:3001/images/P022_E.jpg",
      "SE": "http://localhost:3001/images/P022_SE.jpg",
      "S": "http://localhost:3001/images/P022_S.jpg",
      "SW": "http://localhost:3001/images/P022_SW.jpg",
      "W": "http://localhost:3001/images/P022_W.jpg",
      "NW": "http://localhost:3001/images/P022_NW.jpg"
    }
  },
  {
    "point_id": "P023",
    "coordinates": {
      "longitude": 113.322500,
      "latitude": 23.126667
    },
    "scene_description": "冼村街道在维家思广场附近",
    "images": {
      "N": "http://localhost:3001/images/P023_N.jpg",
      "NE": "http://localhost:3001/images/P023_NE.jpg",
      "E": "http://localhost:3001/images/P023_E.jpg",
      "SE": "http://localhost:3001/images/P023_SE.jpg",
      "S": "http://localhost:3001/images/P023_S.jpg",
      "SW": "http://localhost:3001/images/P023_SW.jpg",
      "W": "http://localhost:3001/images/P023_W.jpg",
      "NW": "http://localhost:3001/images/P023_NW.jpg"
    }
  },
  {
    "point_id": "P024",
    "coordinates": {
      "longitude": 113.321667,
      "latitude": 23.125556
    },
    "scene_description": "冼村街道在维家思广场附近",
    "images": {
      "N": "http://localhost:3001/images/P024_N.jpg",
      "NE": "http://localhost:3001/images/P024_NE.jpg",
      "E": "http://localhost:3001/images/P024_E.jpg",
      "SE": "http://localhost:3001/images/P024_SE.jpg",
      "S": "http://localhost:3001/images/P024_S.jpg",
      "SW": "http://localhost:3001/images/P024_SW.jpg",
      "W": "http://localhost:3001/images/P024_W.jpg",
      "NW": "http://localhost:3001/images/P024_NW.jpg"
    }
  },
  {
    "point_id": "P025",
    "coordinates": {
      "longitude": 113.320000,
      "latitude": 23.125556
    },
    "scene_description": "冼村街道在花城汇广场附近",
    "images": {
      "N": "http://localhost:3001/images/P025_N.jpg",
      "NE": "http://localhost:3001/images/P025_NE.jpg",
      "E": "http://localhost:3001/images/P025_E.jpg",
      "SE": "http://localhost:3001/images/P025_SE.jpg",
      "S": "http://localhost:3001/images/P025_S.jpg",
      "SW": "http://localhost:3001/images/P025_SW.jpg",
      "W": "http://localhost:3001/images/P025_W.jpg",
      "NW": "http://localhost:3001/images/P025_NW.jpg"
    }
  },
  {
    "point_id": "P026",
    "coordinates": {
      "longitude": 113.320000,
      "latitude": 23.125278
    },
    "scene_description": "冼村街道在花城汇购物中心中区附近",
    "images": {
      "N": "http://localhost:3001/images/P026_N.jpg",
      "NE": "http://localhost:3001/images/P026_NE.jpg",
      "E": "http://localhost:3001/images/P026_E.jpg",
      "SE": "http://localhost:3001/images/P026_SE.jpg",
      "S": "http://localhost:3001/images/P026_S.jpg",
      "SW": "http://localhost:3001/images/P026_SW.jpg",
      "W": "http://localhost:3001/images/P026_W.jpg",
      "NW": "http://localhost:3001/images/P026_NW.jpg"
    }
  },
  {
    "point_id": "P027",
    "coordinates": {
      "longitude": 113.320833,
      "latitude": 23.123611
    },
    "scene_description": "冼村街道花城汇购物中心附近",
    "images": {
      "N": "http://localhost:3001/images/P027_N.jpg",
      "NE": "http://localhost:3001/images/P027_NE.jpg",
      "E": "http://localhost:3001/images/P027_E.jpg",
      "SE": "http://localhost:3001/images/P027_SE.jpg",
      "S": "http://localhost:3001/images/P027_S.jpg",
      "SW": "http://localhost:3001/images/P027_SW.jpg",
      "W": "http://localhost:3001/images/P027_W.jpg",
      "NW": "http://localhost:3001/images/P027_NW.jpg"
    }
  },
  {
    "point_id": "P028",
    "coordinates": {
      "longitude": 113.320833,
      "latitude": 23.123611
    },
    "scene_description": "冼村街道在高德置地广场秋广场附近",
    "images": {
      "N": "http://localhost:3001/images/P028_N.jpg",
      "NE": "http://localhost:3001/images/P028_NE.jpg",
      "E": "http://localhost:3001/images/P028_E.jpg",
      "SE": "http://localhost:3001/images/P028_SE.jpg",
      "S": "http://localhost:3001/images/P028_S.jpg",
      "SW": "http://localhost:3001/images/P028_SW.jpg",
      "W": "http://localhost:3001/images/P028_W.jpg",
      "NW": "http://localhost:3001/images/P028_NW.jpg"
    }
  },
  {
    "point_id": "P029",
    "coordinates": {
      "longitude": 113.320556,
      "latitude": 23.122500
    },
    "scene_description": "冼村街道在高德置地广场冬广场附近",
    "images": {
      "N": "http://localhost:3001/images/P029_N.jpg",
      "NE": "http://localhost:3001/images/P029_NE.jpg",
      "E": "http://localhost:3001/images/P029_E.jpg",
      "SE": "http://localhost:3001/images/P029_SE.jpg",
      "S": "http://localhost:3001/images/P029_S.jpg",
      "SW": "http://localhost:3001/images/P029_SW.jpg",
      "W": "http://localhost:3001/images/P029_W.jpg",
      "NW": "http://localhost:3001/images/P029_NW.jpg"
    }
  },
  {
    "point_id": "P030",
    "coordinates": {
      "longitude": 113.320556,
      "latitude": 23.122222
    },
    "scene_description": "冼村街道在花城汇购物中心附近",
    "images": {
      "N": "http://localhost:3001/images/P030_N.jpg",
      "NE": "http://localhost:3001/images/P030_NE.jpg",
      "E": "http://localhost:3001/images/P030_E.jpg",
      "SE": "http://localhost:3001/images/P030_SE.jpg",
      "S": "http://localhost:3001/images/P030_S.jpg",
      "SW": "http://localhost:3001/images/P030_SW.jpg",
      "W": "http://localhost:3001/images/P030_W.jpg",
      "NW": "http://localhost:3001/images/P030_NW.jpg"
    }
  },
  {
    "point_id": "P031",
    "coordinates": {
      "longitude": 113.321111,
      "latitude": 23.121389
    },
    "scene_description": "猎德街道在广州k11购物艺术中心附近",
    "images": {
      "N": "http://localhost:3001/images/P031_N.jpg",
      "NE": "http://localhost:3001/images/P031_NE.jpg",
      "E": "http://localhost:3001/images/P031_E.jpg",
      "SE": "http://localhost:3001/images/P031_SE.jpg",
      "S": "http://localhost:3001/images/P031_S.jpg",
      "SW": "http://localhost:3001/images/P031_SW.jpg",
      "W": "http://localhost:3001/images/P031_W.jpg",
      "NW": "http://localhost:3001/images/P031_NW.jpg"
    }
  },
  {
    "point_id": "P032",
    "coordinates": {
      "longitude": 113.321111,
      "latitude": 23.121389
    },
    "scene_description": "猎德街道在k11艺术购物中心附近",
    "images": {
      "N": "http://localhost:3001/images/P032_N.jpg",
      "NE": "http://localhost:3001/images/P032_NE.jpg",
      "E": "http://localhost:3001/images/P032_E.jpg",
      "SE": "http://localhost:3001/images/P032_SE.jpg",
      "S": "http://localhost:3001/images/P032_S.jpg",
      "SW": "http://localhost:3001/images/P032_SW.jpg",
      "W": "http://localhost:3001/images/P032_W.jpg",
      "NW": "http://localhost:3001/images/P032_NW.jpg"
    }
  },
  {
    "point_id": "P033",
    "coordinates": {
      "longitude": 113.326944,
      "latitude": 23.120833
    },
    "scene_description": "猎德街道在猎德高德汇优托邦附近",
    "images": {
      "N": "http://localhost:3001/images/P033_N.jpg",
      "NE": "http://localhost:3001/images/P033_NE.jpg",
      "E": "http://localhost:3001/images/P033_E.jpg",
      "SE": "http://localhost:3001/images/P033_SE.jpg",
      "S": "http://localhost:3001/images/P033_S.jpg",
      "SW": "http://localhost:3001/images/P033_SW.jpg",
      "W": "http://localhost:3001/images/P033_W.jpg",
      "NW": "http://localhost:3001/images/P033_NW.jpg"
    }
  }
];
