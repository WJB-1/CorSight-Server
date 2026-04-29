# **角色与任务目标**

你是一个资深的 Node.js/MongoDB 数据工程师。请编写一个独立的数据导入脚本，将本地已经结构化好的街景数据集读取、转换并批量导入到 MongoDB 中。

# **工作区域与上下文 (Context)**

* **目标文件路径**：data\_pipeline/import\_seed\_data.js （请创建该目录和文件，保持与主业务架构解耦）。  
* **执行环境**：Node.js。  
* **允许使用的库**：fs (原生), mongoose 或 mongodb (请选择其一即可)。

# **接口与数据定义 (Interfaces)**

## **1\. Input: 本地原始数据**

* **文件位置**：与脚本同目录下的 map\_data.json  
* **数据结构示例**：

\[{  
  "point\_id": "P001",  
  "coordinates": {  
    "longitude": 113.3225,  
    "latitude": 23.136389  
  },  
  "scene\_description": "",  
  "images": {  
    "N": "images/P001\_N.jpg",  
    "NE": "images/P001\_NE.jpg",  
    "E": "images/P001\_E.jpg",  
    "SE": "images/P001\_SE.jpg",  
    "S": "images/P001\_S.jpg",  
    "SW": "images/P001\_SW.jpg",  
    "W": "images/P001\_W.jpg",  
    "NW": "images/P001\_NW.jpg"  
  }  
}\]

## **2\. Output: 目标数据库 Schema (SamplingPoints 集合)**

转换后的文档必须严格符合以下结构：

* point\_id: String (直接映射自原始数据的 point\_id)  
* location: Object (必须是 MongoDB 规范的 GeoJSON Point)  
  * type: "Point"  
  * coordinates:![][image1]  
    (⚠️**严格要求**：先经度 lon，后纬度 lat)  
* scene\_description: String (直接映射自原始数据的 scene\_description)  
* images: Object (直接映射自原始数据的 images 对象)

# **核心逻辑与功能拆解 (Step-by-Step)**

### **步骤 1：数据库连接配置**

* 在顶部预留 const MONGODB\_URI \= process.env.MONGODB\_URI || 'mongodb://localhost:27017/your\_db\_name'; 供我后续配置。  
* 编写连接 MongoDB 的初始化代码。

### **步骤 2：数据读取与结构转换 (Transform)**

* 使用 fs.readFileSync 解析 map\_data.json 为 JSON 数组。  
* 遍历数组，将每个对象转换为符合 Output Schema 要求的格式。  
* **关键映射逻辑**：提取 coordinates.longitude 和 coordinates.latitude，将其组装成 GeoJSON 要求的 location: { type: 'Point', coordinates: \[longitude, latitude\] } 结构。其余的 point\_id、scene\_description 和 images 字段直接透传。

### **步骤 3：批量入库与收尾**

* 将转换后的数组使用 insertMany 批量插入到 SamplingPoints 集合中。  
* 在控制台打印成功插入的条数和失败的条数/原因。  
* **强制要求**：执行完毕后，必须调用代码断开数据库连接，并使用 process.exit(0) 优雅退出脚本，绝对不能让终端挂起。

# **交付要求**

请直接输出 import\_seed\_data.js 的完整可运行代码。并在代码末尾使用注释或 Markdown 告诉我如何使用 node 命令运行它。

[image1]: <data:image/png;base64,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>