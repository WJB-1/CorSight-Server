/**
 * 子模块 5.1: Overpass Proxy
 * 
 * OSM 代理与数据过滤层
 * 作为前端的代理，查询 OSM 数据库并进行数据"瘦身"
 * 
 * 接口端点：GET /api/map/chunk
 * 请求参数：bbox (格式：minLon,minLat,maxLon,maxLat)
 */

const express = require('express');
const axios = require('axios');

const router = express.Router();

// Overpass API 端点
const OVERPASS_API_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

/**
 * GET /api/map/chunk
 * 查询指定边界框内的 OSM 行人相关数据
 * 
 * 请求参数：
 * - bbox: 边界框，格式为 "minLon,minLat,maxLon,maxLat"
 * 
 * 返回：
 * - 标准 GeoJSON 格式数据，仅包含行人相关要素
 */
router.get('/chunk', async (req, res) => {
  try {
    // 1. 提取并验证 bbox 参数
    const { bbox } = req.query;
    
    if (!bbox) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数：bbox (格式: minLon,minLat,maxLon,maxLat)'
      });
    }
    
    // 解析 bbox
    const bboxParts = bbox.split(',').map(s => parseFloat(s.trim()));
    
    if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
      return res.status(400).json({
        success: false,
        message: 'bbox 格式错误，应为: minLon,minLat,maxLon,maxLat'
      });
    }
    
    const [minLon, minLat, maxLon, maxLat] = bboxParts;
    
    // 验证边界框有效性
    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      return res.status(400).json({
        success: false,
        message: 'bbox 坐标超出有效范围'
      });
    }
    
    if (minLat >= maxLat || minLon >= maxLon) {
      return res.status(400).json({
        success: false,
        message: 'bbox 格式错误：min 必须小于 max'
      });
    }
    
    // 限制查询范围（防止请求过大）
    const area = (maxLat - minLat) * (maxLon - minLon);
    if (area > 1.0) { // 约 111km x 111km @ 赤道
      return res.status(400).json({
        success: false,
        message: '查询范围过大，请缩小 bbox 范围（最大约 1 度 x 1 度）'
      });
    }
    
    console.log(`[Map] 查询 OSM Chunk: bbox=[${minLon},${minLat},${maxLon},${maxLat}]`);
    
    // 2. 构造 Overpass QL 查询语句
    // 只查询与行人相关的要素：pedestrian, footway, steps, crossing
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["highway"="pedestrian"](${minLat},${minLon},${maxLat},${maxLon});
        way["highway"="footway"](${minLat},${minLon},${maxLat},${maxLon});
        way["highway"="steps"](${minLat},${minLon},${maxLat},${maxLon});
        node["highway"="crossing"](${minLat},${minLon},${maxLat},${maxLon});
        way["highway"="crossing"](${minLat},${minLon},${maxLat},${maxLon});
      );
      out body;
      >;
      out skel qt;
    `.trim();
    
    // 3. 向 Overpass API 发起请求
    const response = await axios.post(
      OVERPASS_API_URL,
      overpassQuery,
      {
        headers: {
          'Content-Type': 'text/plain',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 秒超时
      }
    );
    
    // 4. 将 OSM 数据转换为 GeoJSON 格式
    const geoJson = convertOSMToGeoJSON(response.data);
    
    // 5. 返回结果
    res.json({
      success: true,
      data: {
        bbox: {
          minLon, minLat, maxLon, maxLat
        },
        query_info: {
          overpass_url: OVERPASS_API_URL,
          filters: ['highway=pedestrian', 'highway=footway', 'highway=steps', 'highway=crossing']
        },
        geojson: geoJson,
        element_count: geoJson.features.length
      }
    });
    
    console.log(`[Map] OSM 查询完成，返回 ${geoJson.features.length} 个要素`);
    
  } catch (error) {
    console.error('[Map] OSM 查询失败:', error.message);
    
    // 区分不同类型的错误
    if (error.response) {
      // Overpass API 返回错误
      return res.status(502).json({
        success: false,
        message: 'Overpass API 返回错误',
        error: error.response.data || error.response.statusText
      });
    }
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Overpass API 请求超时'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

/**
 * 将 OSM 数据转换为标准 GeoJSON 格式
 * @param {Object} osmData - OSM API 返回的数据
 * @returns {Object} - GeoJSON FeatureCollection
 */
function convertOSMToGeoJSON(osmData) {
  const features = [];
  const nodeMap = new Map();
  
  // 首先建立节点 ID 到坐标的映射
  if (osmData.elements) {
    osmData.elements.forEach(element => {
      if (element.type === 'node' && element.lat && element.lon) {
        nodeMap.set(element.id, [element.lon, element.lat]);
      }
    });
  }
  
  // 处理 ways 和 nodes
  if (osmData.elements) {
    osmData.elements.forEach(element => {
      // 处理 Way（道路）
      if (element.type === 'way' && element.nodes) {
        const coordinates = [];
        
        element.nodes.forEach(nodeId => {
          const coord = nodeMap.get(nodeId);
          if (coord) {
            coordinates.push(coord);
          }
        });
        
        if (coordinates.length >= 2) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            },
            properties: {
              osm_id: element.id,
              osm_type: 'way',
              ...element.tags
            }
          });
        }
      }
      
      // 处理 Node（节点，如人行横道）
      if (element.type === 'node' && element.lat && element.lon && element.tags) {
        // 只添加有标签的节点（如 crossing）
        if (element.tags.highway || element.tags.footway) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [element.lon, element.lat]
            },
            properties: {
              osm_id: element.id,
              osm_type: 'node',
              ...element.tags
            }
          });
        }
      }
    });
  }
  
  return {
    type: 'FeatureCollection',
    features: features
  };
}

module.exports = router;
