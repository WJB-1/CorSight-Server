# **导航预览 Agent 验证 Demo \- 开发指导手册 (Phase 3\)**

## **🤖 角色与系统指令 (System Prompt)**

你是一个**高级 Node.js 后端工程师**与**空间算法架构师**。我们正在开发一个用于“视障语义地图”导航的验证 Demo (POC)。

**当前任务阶段：Phase 3（空间逻辑中间件与路径规划）。**

这是整个 POC 最核心的硬编码算法层，旨在将高德地图的“视觉导航数据”降噪并转换为“盲人认知数据”。

在编写代码前，请必须仔细阅读本指南，理解前后端数据流与算法逻辑。**请严格按照文档末尾的『执行步骤』逐步实现，【绝对禁止】跨越模块边界修改未授权的文件。**

## **🏗️ 第一部分：工程架构与 Phase 3 定位 (Architecture Context)**

为了让你了解当前模块在整个流水线中的位置：

1. **输入源**：前端（Phase 2）传来的起终点经纬度坐标。  
2. **处理链路（Phase 3 当前任务）**：  
   * 向外部高德 Web API 请求原始步行导航数据（包含大量冗余节点）。  
   * **核心降噪**：通过中间件过滤掉无意义的直行节点。  
   * **核心计算**：将高德的绝对方位（如“东南”、“西”）硬编码转化为视障者易于理解的相对时钟方位（如“2点钟方向”）。  
3. **输出去向**：生成纯净的 Intermediate Representation (IR) JSON，未来将交给多智能体系统（Phase 4）生成自然语言播报。

## **🚧 第二部分：Phase 3 工作目录与任务约束**

### **📁 工作目录限制 (Directory Constraints)**

在此阶段，你 **仅允许** 在 backend/ 目录下创建或修改以下特定文件。**绝对禁止修改 frontend/ 下的任何文件，也无需关注前端逻辑：**

* backend/.env (新增高德 API Key)  
* backend/server.js (仅用于注册新路由)  
* backend/routes/navigationRoutes.js (新建)  
* backend/controllers/previewController.js (新建)  
* backend/services/amapService.js (新建)  
* backend/middleware/spatialMiddleware.js (新建，核心算法)

## **🛠️ 第三部分：任务模块拆解与具体协议 (Phase 3 Detailed Tasks)**

### **模块 3.1：高德 Web 服务路由请求 (Amap Routing Service)**

* **目标**：在后端向高德地图 Web 服务发起步行路径规划请求（注意与前端使用的 JS API 区分）。  
* **操作文件**：backend/.env, backend/services/amapService.js  
* **内部接口协议**：  
  * 在 .env 中增加配置：AMAP\_WEB\_KEY=your\_amap\_web\_service\_key  
  * amapService.js 需导出异步函数：async function getWalkingRoute(origin, destination)  
  * **请求方式**：GET https://restapi.amap.com/v3/direction/walking?origin={origin}\&destination={destination}\&key={AMAP\_WEB\_KEY}  
  * **容错与解析**：函数必须校验高德返回的 status \=== '1'。若成功，提取并返回返回体中的 route.paths\[0\] 对象。

### **模块 3.2：【核心】空间逻辑降噪中间件 (Spatial Logic Middleware)**

* **目标**：将高德返回的冗长 steps 数组提纯，并完成绝对方向到相对时钟方向的硬编码数学转换。  
* **操作文件**：backend/middleware/spatialMiddleware.js  
* **核心算法协议**（*严禁猜测，必须严格用代码实现以下逻辑*）：  
  * 导出函数：function generateIntermediateRepresentation(pathData)  
  * **步骤 1：过滤 (Filtering)**。遍历 pathData.steps。丢弃所有 action 为空、为 \[\] 或纯直行且无障碍物特征的过渡路段。仅保留 action 明确包含“左转”、“右转”、“天桥”、“地下通道”、“斑马线”等发生物理状态改变的关键节点。  
  * **步骤 2：方向映射 (Direction Mapping)**。高德 API 返回的 orientation 可能是中文（如“东”、“西南”）。需建立一个字典将其转换为绝对方位角 ![][image1]：  
    * 北=0, 东北=45, 东=90, 东南=135, 南=180, 西南=225, 西=270, 西北=315。  
  * **步骤 3：时钟方位计算 (Clock-Face Math)**。假设上一关键节点的绝对方位角为 ![][image2]，当前关键节点的绝对方位角为 ![][image3]。  
    * 计算相对转向角度差值：![][image4]  
    * 映射到 12 时辰：let clockFace \= Math.round(deltaTheta / 30);  
    * 若 clockFace \=== 0，则强制设为 clockFace \= 12。  
  * **输出格式 (JSON IR)**：将处理后的数据组装为极简的中间格式：  
    {  
      "route\_summary": {  
        "total\_distance": "121m",  
        "duration\_estimate": "97秒"  
      },  
      "key\_nodes": \[  
        {  
          "node\_index": 1,  
          "distance\_from\_start": "10m",  
          "action": "左转",  
          "clock\_direction": "9点钟方向",  
          "instruction": "向南步行10米左转"  
        }  
      \]  
    }

### **模块 3.3：控制器集成与 API 暴露 (Controller Integration)**

* **目标**：暴露 REST 接口，串联起高德请求与空间中间件（暂不接入 LLM，直接返回中间件生成的 IR JSON 用于接口联调）。  
* **操作文件**：backend/controllers/previewController.js, backend/routes/navigationRoutes.js, backend/server.js  
* **对外接口协议**：  
  * **Endpoint**: POST /api/navigation/preview  
  * **Request Body**:  
    {  
      "origin": "116.434307,39.90909",  
      "destination": "116.434446,39.90816"  
    }

  * **执行流水线 (Pipeline)**：  
    1. 接收起终点参数。  
    2. 调用 amapService.getWalkingRoute(origin, destination)。  
    3. 将返回的 path 数据传入 spatialMiddleware.generateIntermediateRepresentation(route)。  
    4. 将生成的 JSON IR 作为 API Response 返回给前端。  
  * 在 server.js 中挂载：app.use('/api/navigation', navigationRoutes);

## **👣 你的执行步骤 (Action Plan)**

请**严格按照以下步骤顺序**向我提供代码。每完成一个步骤，请等待我的确认后，再进行下一步：

1. **执行 3.1**：提供 .env 补充说明，以及 backend/services/amapService.js 的完整实现。  
2. **执行 3.2**：提供最核心的 backend/middleware/spatialMiddleware.js。请务必在代码中体现“过滤字典”、“角度映射”和“时钟算法”的详细注释。  
3. **执行 3.3**：提供 backend/controllers/previewController.js 和 backend/routes/navigationRoutes.js，并展示需要在 server.js 中增加的挂载代码。

准备好了吗？如果你已阅读并理解所有约束与算法协议，请回复：“已完全理解 Phase 3 的算法约束与架构要求，马上开始执行 3.1 的代码编写。” 并直接给出 3.1 的代码。

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAYCAYAAAAlBadpAAAA8klEQVR4XmNgGAW0AfLy8p/k5OSM0cUJARagxjlA/B+Ig9Al8QJZWVlboKafIM1Am8vR5fECoKaLCgoK7iDNQHohujxOoKysLAvUEA7UKAl19lJ0NVgBKHCA+BGILSoqygPVfBpdHQaQkZHhBCrcDLR1AoiPpPkhuloMAPIn0NYYNDGQ5q/IYtgAI9DGU0DbVaF+hWGQ5t/oiuHA2NiYFWjjfCCTBV0Oqvk/ujgcADW6AhXcRRcHAUKamYGS1xUVFcXRJUAA5F9smhmBNoYC/bkLKPkeiFOQJYHiAkADzYDi/0CagSnOT1paWgZZzSigBwAAidQ7URvS+HEAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAYAAAA14t7uAAABFUlEQVR4Xu2SPQrCQBCFI/6AYBtF8m+6WMZSjyCCjY29B8h1BPUGghewtLUQKwtBPIBgZaFvdAPLGAmraRQfDJt9b/KRnY2m/fXbchwnQp24/7EAPaKu3P9IlmV1CJopWNf1CoBL1CVTMGAb13UHWPcCnOM97ygH2MI0zTLWHYHpBLxJSQK20MQXinHQnOusVU0A9GkM8R7jmBHYtu2G3KcsQNaADOO9BA7lPiXh5aY49lMh68q9dLHwps7jcl+PKQzDIhoneCzIPgEJDNBI9rHv4T9vpYIRrlAR92kE8M+oMc9IaeA8wq3neTUexGCaNc9IiWDf96t0TLniLAiCEqBznsNry4xEcBb6SvDBMAyT+3/ddQO3uFf+ZZblLgAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAYAAAA14t7uAAABVklEQVR4Xu2TLUsEURSG7+IHCKJpFGHne9IYB0wajRaLQav4AxY0GsRosAuiYBVh/8CCxWpYLBo0GIyCSUSfo3OHw9Uyu5NkXzjMve979pm5Z2aNGel/KwzDDvXq+kML6DP16fpDyff9FYE2CvY8bxpgj3pvFAysH0XRBtfHEtxyewZRC1i33W5PcX0QsJzAbaqlEtY15ROW45A5Lzit9QRgXcZg94zjTMBBECS6r7aA3ALZsnsFLnRfLfHjxfLYv4psTffiXeJtU/usP5IkmdV5paIoJmg6ZTmufQEKmCff0T7eeZZlM+bnRR/Qt6fzSoQ3VMf1ZQT4b9SJ9tn3yVZVT++vL2eM4C6O43k3sGCZtZtZkW9SR5WRpumcHFOXzfI8nwR65eZ4yxXAfN94F/9ee40I6DWniVx/YDG2JaAXdg/72DTxt5fjUy+M4kmK9aHbM5L5AlKAYI5XDdmmAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARsAAAAZCAYAAAABkoqeAAAK6UlEQVR4Xu1cXYhdVxU+w0RQ/K0a0/zdfWcSDUVBS7SlWqEPjSQURUzFSvsgFWmRvrSBhoKgpfRBHySkBSVEQh+ktS0UsVXRIENbammCWknog4b+kBLa0ARDE0hCEr/v7LXOXWeds++ce+fOnTvD+WAxZ6+9zz5rr7322mv/3MmyFi1atGjRokWLFi1atGjRokWLFi1atGjRwiOEcLnb7e7x/H7YsGHDh/DewU6n84TPGzdmZ2c/Tlm2bt36AZ+XAspfC9l3e/6kY7nKPWrMzMxAFeE1PE75vGGAunaCTnj+uIF2rYEca9HHt2KMrff5kwDqHvLdnw2qe3EaV0AnfV4KKHsNO5oKwd9f4uPX+TLjBGTYB2f5iuenQKeEd57EO4/5vEnGcpAb8u1if8A2vslJwOcrOKCk7F6UvdnnA1Pgb5W+fZBpXwD865G/0/OHAeo5he/d4fnjBuQ4G+J4vEId+vwUNm3atNHos997Xq91mGY9LMN6fSaBvJMD6Z6OBh/+szYQz5/3ZTzWr1//KZanwEyvXr36I0ifgcP5oi87DkAZn2Eb2BaflwIdk3ToHOX3+ZOKxZabzgzf6Hp+E+C1B0D/1jQHLmUF725bTqLQp8D/AZJTsKcNSL9kHY441UvWmCW9T9OGT6Pf7/mDgDKCtnv+UiFER9zU2UxR97D/zyojpXukvwT+MdA1TOPvDtDRdevWfVrLIH0QdFrTqOt+pC9nztnTV1D3eFxl+UlQwXjhFDuLwoEeympmEAM2bA/KPcpnMsTZNFXMyAF5biN5fj9A3tdBb4Je2LJly0d9/qRiseWWGe9fnt8EeO8o7YDOn2lxIsdBh1DvVVpO7OdKJvaDvN1Mg+40Zbb7CUQmxUuaNvwDwQyOQSHO7+V+Udi4EQZwNnQUovsjTvfU6SEtxzyW2bhx49eZlnE7BzqJtn9Oy8l7HN85ZFnHVYwPRBghHUB9X3D8erCTQDfgcRX+Pi4fosOphZaxRhB6ihn7PoIMjrNZU+8a27lfZvDH8HycHeMLTSDGIvdCnA3e/RXtQCMupGeRPhHKM+eU2Nhz5tXc8PWZ+xTIfwN0ny2jTsnOwsLPvzOssxBnddHzlxJhAGdDmxDd/9Hpnno+quVEp3TyFnT405qQ/ud7O0wZOn/a3HP4+0HLl+/M76glVH08k4GK5xvkQ8dd0QIhOqeSwPBsXyGviWJGDTT+Li9PP0DGbaC3+BxiNFcsBycZ45JbjG0oZ+MBu/gW+wZ99DPliSOhje1lGnmfKF4QiAxsX8mewLud7/rl+po1az4M/kHPb4oQo4KKzct2wVqJBFZxIEPem5Bel/Wif0b63ya/eNGBUQPq+THacwejBJ+vYB0oc6uMy8bOpg51uhe9czlE0MEUTkbB74nuS7YF3sOgY15+0X3/LRTdaMxcRADeeRFqxvIJejXJe5tKUQL/9+CdwPOsf0chIRsV2IjY0Vn/5VyOENeX5zw/BZR9VUPNjsyUw3boODEuuUfhbLh3AJu4jTKGaGMFgjgM9ptGZnj+WzDLIzH4SvtSfMnbTfL8JhB5fuv50o7fIe8I6MVMBme3t2/2IuirwuNGNccOVwk5MOC/jPRJ5F2tPAzKb4D3JxsJhGjDxWqBesE7z6famgLHp8icy4fnT5psRsaU+RzyH5S92huRPg2ZghYS26o4mxSfEDnTuqdSQO/W8J9MvWzWgXXUd8MS+btQ51tNCeX/Kg6nL0Kclc54fh1kt/47mu6I8YJut+UmDeOUm8YUFuhsTB8eBt3i8nR/hkvfHFzzhxgxXytlap1Kik9QF2HITWKRp/Zd/WbXXAsJcZYn73vKM/uWxbgJ0UlpJKHQZaRuVWi65JTpNKS+SltTQNmbRe8XQIczE7mofCQ7TpG+B+34i1l+1TqVFJ+Qemv1lyPEvZdSAwmGjCF66P/4I69O9IRU8l2Gl4e8oIdt2XEhxM3SNz2/Bgx399h7OMZ4K451gjBWuaU/F+RsFJxBKafdWxKjpXEWezbgXYX0oSCHDqZ9jZ0Ned0hrwP006V88yJt3/Aqe0cJZ8N2HtO04+fLNnG0TJcmjrCAZRSjFtH9S6p762xsWbYrxDt2+UmctK3iVFJ8gnX20z1Dqj+kjopR4TYRjBemLJ8f5OBeqzw8P82yqboWGyLPvM6G7ZU2VcgqSpaXj8AINqG9P8LzERtm1kFOM/Y1IXzr3gEvHjaSW8JiDoy3g4kaUpCN5ntVLkPPgM7U8PN7M76e+RDiXY0roHuYFhlLg9KciuRr/xCPYysDzbxbuZPDvH4G3w9eHgv5ZmlPQsZBKULwzsYM7jktowhyzYTPUldlEIcFOBuFfL9wLpIu2Qa/K/yDUua+OnlEzveCHJlb8P2k7lkRaJvnK2i4XlBCPlhaLoV42tB4g3bUCM2dzav+9CZIhwYzy9LDB1G8lGF+OkRcZDSVW/psB/rop6GBs0lBjG+oyAbv3khyvFIkw3ymdVASxtnkRi4ycEAWS0eiK4cBdZuRHJRJg58HXh4L1hvcBKttqnM2QSL8MTubadF7acNXvk9HkJ8gSTrlbOYkzfae46GPLRfipFHZIJa8emcjYds7nu/RiXcaSpeCfIfKuf1Z8K5XXgqi/MpGcIoG2CDOjdTzDbgmfsgahsIYRBHqyqZeMdhCQ2e2CBhIboUar+c3hRjfwM4mFaaH3v2t/PQp621UFg6c94WQfiH0jlb1GkZpaa51ZTV2wXanHMZ8YJ21gyUb3NnYeqSd72na8Ue2jApxDFTaIPXayIZ3nmpPkunImZYovSSPnval9CtyVvOQ8WiIm3GVMNnRYVYCIV7RjdoQf6LwdBZPsLiX8EBnmN9HjBChZ4C1gHxfQ/4pzyfMAEk6E+RdBD3j+YuNYeVeKmeT9TY6LyjDRCzngzmlwfNl0Mua7sg9GR7XKq9bc6lP6qpc6iPA399kYNYhxGXjnOcT4mxKkccAziY/ZdI0YVYNu4SV641tteVC/J1WU2fDMc06i0jQ2Mh5X07TwuPG+ms2epb3ikt9cl3hjU71Ul+OpJxS0aBUGEaIG3nvg05Dsd+3dS8FZHBULvWB/2vfBnfcaPOU/Ey6s1OzP7CYWKjcS+hsdJb8b4hH2ZywKNv/MjcZsT34zhPI+yfoNywHW/q5LUOA/5TU8UM+450DnGV9uY44q7oosAlYb6i51CffLogDis7E8fPI1/GKrYbNmzd/LMSfWVyQvzwBLi13pMwjoPc78TTp7/jOTVof+9SWr4PonvVT94wS9bSspPtu/LnCpW68rnIuxP4pQU6dOc65x8ilKyeHn/hyhOi+tLUySkxz+TTIJudiQq+ah5p7QQsB1qbXoc5/eP6kYymdjWC6G09CaKjbu+7GqQEj47ycP/U0mJILcXRcGglUoBfYPL8punInyPNHBY4V7nXMtzXAJRXtjs96sU/vVjUB+050upe69/mKmXjXhz/W/G6d8xbwh5i/oO77XUGh7ps4wxWDYX6I2Q/ojEDis/zupPLjv0nFQp1NFjcbi98xLQeEeHFuoH+P4tGdsB9iLgd0ej/ETDrQFYkQ70IkT9iaAgZ3Neh5hrMS0r4bau4jTSrE2TS+Ub0CwD2PY+izrs8YBJy9Q5/rIC2qoIOn7j1/xUOWUwP986wWyxuMPsMK/OdZywHUfWeJD4eWFOJwkmv7FisL6OtnxeBHBtR5i7/X1KIMOQp/Nqv5IWeLFi1ajBX/BxPMfxsgrwefAAAAAElFTkSuQmCC>