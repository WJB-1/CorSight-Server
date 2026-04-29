# **导航路线行前语音预览功能大模型概念验证（POC）深度实施方案与底层逻辑架构**

## **1\. 视障人群空间认知模型与产品核心设计哲学**

在为视障群体（包括盲杖使用者与导盲犬使用者）设计基于大语言模型（Large Language Models, LLMs）的导航辅助功能时，必须首先从根本上解构视障者的空间认知建构模型与定向行走（Orientation and Mobility, O\&M）逻辑。传统的导航软件设计范式高度依赖于实时的、高频的视觉反馈与连续不断的听觉指令，而这种范式在视障用户的真实出行场景中是完全失效且存在极高安全隐患的。复杂的物理环境噪音与信息过载的语音播报会严重挤占视障者有限的听觉认知资源，甚至掩盖至关重要的环境听觉线索，如接近的车流声、周围行人的脚步声以及环境声波的反射回音\[1\]。

基于定向行走（O\&M）领域的专业理论与最佳实践，视障者的独立出行能力建立在“定向（Orientation）”与“移动（Mobility）”两大基石之上。定向被定义为“了解自身相对于周围被观察或被记忆事物的距离与方向，并在移动过程中持续追踪这些空间关系的变化”\[2\]。而在实际物理移动发生之前，视障者必须在心理层面完成一种被称为“寻路（Wayfinding）”的认知建构过程。寻路涉及引导行动的规划、战略性组件、蓄意移动以及达成目标的能力\[2\]。因此，“行前语音预览”功能的本质并非传统意义上走在路上的“实时导航（Navigation）”或“实时避障”，而是一次在绝对安全、安静环境下进行的\*\*“路径心理沙盘推演”\*\*。为确保大模型在概念验证（POC）阶段能够输出完全符合视障者真实诉求的内容，系统底层架构设计必须被置于以下三大不可逾越的核心约束法则之下，任何技术选型与提示词工程都必须为这些法则服务。

### **1.1 极简与克制：听觉认知负荷的严格控制**

视障者在真实的户外环境中，其感官处于高度紧绷与超载状态。如果语音播报包含大量“无脑播报”和“视觉特征描述”（例如“左前方有一块蓝色的指示牌”、“道路两旁绿树成荫”），这不仅无法提供任何实质性的定向帮助，反而会引发极其强烈的认知干扰与心理反感。环境音频信息的过度渲染被视障群体视为一种“视觉特权”的无意识施加。因此，大语言模型的输出引擎必须被施加最严格的“文本截断”与“信息降噪”机制。系统的每一次语音输出必须做到“惜字如金”，仅仅输出用户“必须采取的行动操作”与“前方路段不可预知的物理风险”。任何试图让大模型发挥“文学创造力”或“拟人化情感关怀”（如“请小心您的脚下”、“祝您旅途愉快”）的提示词设定，都必须在工程层面予以坚决屏蔽。

### **1.2 聚焦关键决策点与盲区边界**

常规的数字地图应用程序接口（API）通常提供的是线性、平滑的路径规划数据，致力于缩短通行时间或减少步行距离。然而，视障者在出行中最关注的并非平滑的路段，而是那些打破常规节奏的“非线性物理突变点”。对于盲杖使用者而言，他们需要提前知晓地表形态的剧烈变化，如即将遭遇的连续台阶、天桥入口、地下通道或缺乏盲道接入的斑马线。提前预知这些节点，能够让他们在心理上做好准备，并适时调整盲杖的探路节奏（如从两点触地法切换为滑动探雷法）\[3\]。

对于导盲犬使用者，需求则更为具体。导盲犬经过严格的专业训练，能够理解并执行特定的物理寻路指令，并在遇到危险时表现出“理智的违抗（Intelligent Disobedience）”。因此，使用者需要从行前预览中获取具体的物理结构节点信息，以便在到达特定区域前向导盲犬下达诸如“找楼梯”、“找斑马线”、“找门”的战术指令\[4\]。此外，传统导航系统通常在距离目的地最后50米处宣告导航结束（例如进入复杂的封闭型小区内部、广阔的商场广场），这恰恰是视障者由于缺乏物理参照物而最容易彻底迷失的“最后五十米盲区”。系统必须具备识别并着重描绘这些微观关键节点的能力，提供高保真的触觉或听觉参照物引导策略。

### **1.3 绝对的时钟定位法参照系**

在缺乏视觉参照物以及绝对物理坐标系（如东西南北）感知受限的情况下，常规导航系统中“偏左75度”、“向右前方斜穿”等表述属于高度抽象的空间描述，缺乏直观的可操作性。根据国际通用的定向行走最佳实践与无障碍导航标准（如Wayfindr Open Standard），\*\*时钟定位法（Clock-face orientation system）\*\*是视障群体构建自我中心空间参考系（Egocentric spatial reference）的最有效、最标准的手段\[5\]。

在该参照体系中，观察者（即用户自身）被假设位于一个水平时钟表盘的中心。用户的正前方永远被静态定义为12点钟方向，正后方为6点钟方向，正右侧为3点钟方向，正左侧为9点钟方向\[7\]。这种方法的巨大优势在于，它将极其复杂的空间几何角度，转化为视障者在日常生活中高度熟悉且能够瞬间进行心理映射的12个离散方位点。这要求系统底层架构在将生硬的地图空间数据输入大语言模型之前，必须在中间件层面完成从绝对地理坐标系（经纬度与指南针方位角）到相对自我中心时钟方位系的精准数学映射，绝对禁止使用任何含糊其辞的角度或视觉方位表述。

## **2\. 任务 1：验证期的底层大语言模型选型策略与多维评估**

在“导航路线行前语音预览”功能的POC阶段，选择合适的底层大语言模型（LLM）不仅决定了系统能否顺利跑通核心功能逻辑，更直接关系到未来产品进行大规模商业化扩张时的运营成本、响应延迟以及最核心的用户隐私安全保障。大语言模型在处理三维物理空间、几何拓扑关系以及具身导航逻辑时，往往面临着内在的架构局限性。这是因为当前大多数LLM的训练语料库主要由线性文本构成，模型虽然能够通过统计规律在语言层面描述空间概念，但缺乏对物理空间、几何深度以及具身体验的内禀认知与抽象世界模型建构\[8\]。

近年来，学术界与工业界推出了多个专门针对大模型空间推理能力的基准测试（Benchmarks），如MapBench、OmniSpatial、FloorplanQA等，以量化评估模型在路径规划、复杂路网解析及地理空间策略方面的能力\[10\]。以下将基于这些前沿研究成果，从地理空间逻辑推理能力、响应速度与边缘部署可行性、以及验证与运营成本三个核心维度，对“直接调用云端大模型API（如GPT-4o, Gemini 1.5 Pro, DeepSeek-V3）”与“本地部署开源模型（如Qwen 2.5, Llama 3）”进行深度对比剖析。

### **2.1 云端大模型与本地开源模型的综合对比矩阵**

| 评估维度 | 云端大模型API (以 GPT-4o, Gemini 1.5 Pro, DeepSeek-V3 为代表) | 本地部署/私有云开源模型 (以 Qwen 2.5, Llama 3.1 为代表) |
| :---- | :---- | :---- |
| **地理空间推理与路由规划能力** | **极高。** 在多任务空间评估数据集中，GPT-4o在路径规划任务中展现出统治级表现，特别是在应用思维链（Chain-of-Thought, CoT）提示策略后，其规划准确率可从12.4%飙升至87.5%\[11\]。Gemini 1.5 Pro及后续的Gemini 2.0在原生整合谷歌地图等外部函数调用方面具有生态优势，在几何推理与地理空间策略追踪上处于领先地位\[13\]。 | **较高且迭代极快。** Qwen 2.5（特别是32B及72B参数版本）在空间方位映射、指令遵循和结构化输出上表现优异，在如SpatialBench等基准测试中，其视觉语言版本甚至能够匹敌闭源旗舰模型\[15\]。Llama 3.1已被证实其内部网络层能够稳健地激活并表征智能体在网格世界中的笛卡尔空间特征\[9\]。 |
| **响应速度 (Latency) 与并发稳定性** | **中等至较快，存在不可控波动。** 高度依赖公网带宽、API提供商的算力调度与区域节点拥堵情况。首字响应时间（Time to First Token, TTFT）通常在数百毫秒至数秒之间浮动。在高峰期可能遭遇Rate Limits（速率限制）。 | **极快且完全可控。** 在配备合理GPU集群（或端侧NPU加速）的部署环境下，推理延迟极低。以Qwen 2.5 14B为例，其在经过优化的基础设施上能够实现极高的吞吐量（例如每秒800 Tokens），极大降低了TTFT，尤其适合流式语音生成的前置文本输出\[18\]。 |
| **验证阶段与长效运营成本 (Economics)** | **高昂，呈指数级累加。** 路线解析任务涉及极其冗长的JSON payload输入（包含大量途径点、坐标串和POI属性）。以GPT-4o为例，其输入/输出百万Token的成本高达$2.50/$10.00\[19\]。长期高频次调用将导致不可持续的边际成本暴涨。 | **极低（仅含算力摊销）。** 开源模型无需支付高昂的API调用费。根据行业基准测试，在满载运行条件下，Qwen 2.5 14B等模型的运营成本相比GPT-4o-mini可降低约2.3倍；相较于GPT-4o则更是存在数量级的成本优势\[18\]。极大地释放了产品灰度测试阶段的预算压力。 |
| **数据隐私与无障碍合规性 (Privacy & Compliance)** | **风险极高。** 必须将包含用户精确GPS定位、住址、常去目的地的出行轨迹数据明文出境或上传至第三方公有云，在GDPR等严格的数据隐私保护法案下，极易引发合规危机。 | **完美闭环。** 完全实现数据的私有化流转。用户的日常通勤轨迹、精准位置信息均在本地网络域内完成推理与销毁，符合最高级别的无障碍隐私保护及数据安全标准。 |

### **2.2 核心维度的深度学术与工程剖析**

**维度一：地理空间逻辑推理能力 (Spatial Reasoning Capability) 的适度溢出**

大语言模型在本功能中的核心职责，是将包含多段经纬度、转向角度和道路类型标签的JSON字典，转化为符合视障者认知习惯的连贯自然语言路线描述。这要求模型具备强大的“空间工作记忆”与实体关系解析能力。研究表明，采用文本格式中的笛卡尔坐标表征，相比于纯自然语言描述，能显著提升LLM在导航任务中的成功率与路径效率\[9\]。尽管GPT-4o与DeepSeek-V3等顶级模型在复杂长逻辑链推理（如Humanity's Last Exam等基准）中占据绝对霸主地位\[20\]，但在实际工程落地中，高度复杂的全局最短路径算法（Dijkstra或A\*）以及路况拥堵规避，实际上已经由高德、百度或OSM等地图底座的路由计算引擎（Routing Engine）完美解决\[23\]。 LLM在此处的角色被收窄为“空间语义信息的提炼者与自然语言重构者”，而非从零开始的“寻路算法引擎”。因此，千亿参数级别的开源模型（如Qwen 2.5 72B）乃至几十B参数的中等模型（如Qwen 2.5 32B Instruct），其具备的指令遵循能力与空间逻辑重组能力，已经完全满足甚至溢出了当前POC任务所需的推理门槛限度。

**维度二：计算经济学与验证成本 (Validation Economics)**

对于一款旨在辅助视障者日常高频出行的应用而言，Token的消耗速度是极其惊人的。地图API返回的原始Route JSON常常包含成百上千个包含详细属性的节点。云端API的按量计费模式将成为阻碍产品大规模灰度测试的阿喀琉斯之踵。GPT-4o的价格矩阵相比针对代码和逻辑优化的开源模型（如Qwen 2.5 Coder 32B Instruct或基础Instruct版）高出数十倍之巨（GPT-4o输入成本为 $2.50 / 1M tokens，而 Qwen2.5 约为 $0.20 / 1M tokens）\[19\]。如果强行依赖云端超大模型完成所有普通用户的日常路径预览，高昂的服务器账单将迅速耗尽项目的验证资金。

**维度三：响应速度与用户心理预期 (Latency & Psychological Expectation)**

尽管“行前语音预览”被设定为在安全、安静的室内环境中进行的沙盘推演，用户无需像在繁忙十字路口那样渴求毫秒级的避障反馈，但这并不意味着可以容忍漫长的网络加载。超过三秒的API等待延迟，依然会严重破坏视障者精心构建的出行心理准备节奏，导致不可控的焦虑感。本地化部署的中小型参数模型配合先进的推理加速框架（如vLLM或TensorRT-LLM），结合流式输出（Streaming Output）技术，能够实现用户几乎无感的即时响应。前端TTS（Text-to-Speech）引擎可以在接收到大模型生成的第一个标点符号时即刻开始语音合成与播放，从而打造出流畅无缝的交互体验。

### **2.3 基于POC验证目的之最终选型推荐**

针对“仅仅是为了跑通功能验证，并为后续产品化奠定基础”这一核心任务目标，本方案坚决摒弃单一模型依赖，提出\*\*“双轨制验证与渐进式迁移策略”\*\*：

1. **早期逻辑验证与提示词探测基准（Baseline Probing）：全面采用直接调用 GPT-4o API。** 在POC的最早期（封闭实验室环境），研发团队应当毫不犹豫地将GPT-4o作为“性能天花板”与“逻辑试金石”。利用其无可匹敌的复杂指令遵循能力、卓越的零样本推理（Zero-shot reasoning）以及对异常数据的强鲁棒性，快速试错并验证“时钟方位转换逻辑”和“极简克制播报原则”在自然语言生成层面的可行性。这一阶段不考虑Token成本，唯一目的是固化完美的Prompt模板工程，并生成一套涵盖各类极端路况（如连续天桥、隐蔽地下通道、无盲道大型广场）的黄金测试集（Golden Dataset）。  
2. **核心POC落地与用户灰度测试首选：迅速迁移至本地/私有云部署的 Qwen 2.5 (32B 或 72B Instruct 版本)。** 一旦通过GPT-4o确立了中间数据格式与提示词模板，必须立即在架构上进行切流，采用vLLM框架将Qwen 2.5系列模型部署于本地服务器或受控的私有云环境中进行实际的视障博主路测。  
   * **战略考量一：** 经过百万级数据监督微调与对齐的Qwen 2.5 Instruct模型，在中文语境下的语义连贯性、格式化输出的稳定性以及对严苛结构指令的服从度上，稳居开源生态的第一梯队，完全具备接管格式化路径预览任务的能力\[17\]。  
   * **战略考量二：** 本地部署彻底斩断了数据外泄的链路，为视障用户极其敏感的出行轨迹与家庭住址提供了物理隔离级别的隐私庇护，符合国际无障碍技术的最高伦理标准。  
   * **战略考量三：** 从宏观计算经济学模型来看，路线JSON解析耗费大量输入Token，将高频次、长文本的固定格式推理任务交由极具性价比的Qwen 2.5执行，能够将验证期的长期边际成本趋近于硬件折旧本身，为该功能从小规模实验走向普惠千万视障群体的大规模商业化扫清了经济障碍。

## **3\. 任务 2：提示词工程与输入数据结构设计**

现代地图导航服务商（如高德地图、百度地图、Google Maps或开源的OpenStreetMap）提供的API接口，其底层逻辑是专为带有多彩屏幕的高清视觉渲染引擎以及机器底层的物理路由计算而设计的\[23\]。当开发者调用路径规划接口（如高德的 v3/direction/walking 或百度的 direction/v1）时，服务器会返回一个极其庞大且嵌套极深的JSON对象。这个对象中塞满了海量的、对于视障者而言毫无意义的冗余数据，例如用于在屏幕上绘制蓝色平滑曲线的成百上千个微小路段经纬度坐标点（Polyline串）、路况拥堵的十六进制颜色编码、乃至周边毫无关联的商业POI推荐\[28\]。

大语言模型虽然拥有动辄几十万甚至上百万的超长上下文窗口（Context Window），但如果研发团队试图通过一种“偷懒”的方式，直接将这些未经过滤的原始API JSON数据“喂”给模型，将引发毁灭性的灾难。模型极易在冗长的数据迷宫中产生“注意力迷失（Attention Degradation）”，进而导致严重的“空间幻觉播报”。例如，大模型可能会将为了绘制道路微小弧度而生成的连续坐标点，错误地理解并播报为“前方有连续急转弯”；或者将地图标注的普通商业店铺当作关键地标，彻底违背我们确立的“极简原则”。

### **3.1 空间逻辑中间件（Spatial Logic Middleware）与数据清洗机制设计**

为了从根本上消除这种跨模态认知鸿沟，系统架构必须在前端地图API与后端大语言模型之间，硬性插入一层专门编写的\*\*“空间逻辑中间件（Spatial Logic Middleware）”\*\*。该中间件扮演着“信息过滤器”与“认知翻译官”的双重角色，负责拦截生硬的地图底层数据，并通过确定性的代码逻辑将其剥离、计算、重组为大模型易于理解、不易产生幻觉的中间表达格式（Intermediate Representation, IR）。

**处理流程一：空间无障碍关键节点（Accessibility Key Nodes）的语义提纯**

中间件在解析路线步骤数组（如JSON中的 routes.legs.steps）时，必须执行大刀阔斧的修剪。果断丢弃所有仅用于绘图的中间经纬度坐标集（encodedPolyline），仅筛选并保留那些发生了 **动作状态改变（Action Change）**、**道路物理属性突变（Road Type Shift）** 以及带有 **无障碍设施标记（Accessibility Tags）** 的绝对关键节点。

例如，在接入OpenStreetMap（OSM）数据时，系统需利用正则表达式或标签解析库，专门抓取带有 highway=steps（台阶出现）、highway=crossing 且包含 crossing=traffic\_signals（具有红绿灯的过街斑马线）、以及 tactile\_paving=yes/no（是否存在标准盲道铺设）等语义明确的无障碍环境标签\[31\]。这些节点才是视障者构建心理沙盘的“承重墙”。

**处理流程二：相对时钟方位（Clock-Face Orientation）的确定性算法预处理**

这是系统设计中最容易犯的致命错误：**绝对不能让大语言模型去执行从经纬度坐标或指南针绝对方位角到时钟方位的数学计算。** 语言模型本质上是预测下一个Token的概率机器，其在执行精确的几何角度加减法与区间映射时，具有不可根除的幻觉倾向。方位映射的数学计算必须在中间件中通过严谨的硬编码（Hard-coding）程序确定性地完成，从而将大模型彻底从计算苦海中解脱出来，使其只需进行简单的文本转述\[7\]。

大多数地图API在返回每个 step 时，会附带 orientation（指南针绝对方位角，正北为0度，顺时针递增至360度）和 action（如“向左前方行走”）\[34\]。中间件算法推演逻辑如下：

假设用户当前正在行进的路段绝对方位角为 ![][image1]（例如正东，90度），下一个路段的绝对方位角为 ![][image2]（例如东北，45度）。

计算两路段之间的相对转向角度差值 ![][image3]：

![][image4]（在本例中：![][image5] 度，即向左后方转向）。

将 ![][image3] 映射到视障者熟悉的12时辰制表盘上。由于表盘共有12个刻度，360度除以12等于30度/小时。

计算公式为：Clock\_Face\_Value \= Math.round(Δθ / 30\) （如果 Clock\_Face\_Value 结果为 0，则转换为 12点钟方向）。

在本例中：![][image6]，四舍五入为 11。即需要向 **11点钟方向** 行进。

经过中间件的算力处理后，系统直接向大模型输出诸如 "relative\_clock\_direction": "11点钟方向" 的强语义文本。LLM无需任何思考，只需在其生成的语言结构中稳妥地嵌入这一现成结果。

**设计标准化的中间格式（JSON IR）：**

以下是经过中间件深度清洗与算法预处理后，最终通过API“喂”给大模型的理想JSON输入结构示例。该结构具有极高的信噪比，每一字节都蕴含着关键的行动语义：

{  
  "route\_summary": {  
    "total\_distance": "700m",  
    "total\_duration\_estimate": "12分钟",  
    "complexity\_level": "高"  
  },  
  "key\_nodes": \[  
    {  
      "node\_index": 1,  
      "distance\_from\_start": "100m",  
      "action": "跨越市政天桥",  
      "clock\_direction": "11点钟方向",  
      "hazards": \[  
        "存在连续两段向上陡峭台阶",  
        "起步端缺乏触觉盲道接入"  
      \]  
    },  
    {  
      "node\_index": 2,  
      "distance\_from\_start": "600m",  
      "action": "横穿复杂无信号灯交叉路口",  
      "clock\_direction": "12点钟方向",  
      "hazards": \[  
        "无声响提示红绿灯",  
        "大型机动车与非机动车高度混行区域"  
      \]  
    },  
    {  
      "node\_index": "destination\_blind\_zone",  
      "distance\_from\_start": "650m",  
      "action": "切入目的地最后50米盲区",  
      "clock\_direction": "2点钟方向",  
      "hazards": \[  
        "进入无导航数据覆盖的内部道路",  
        "必须沿右侧实体砖墙寻找建筑物入口"  
      \]  
    }  
  \]  
}

### **3.2 深度防范式提示词模板提供 (Defensive Prompt Template Design)**

基于上述高度凝练的中间格式，以下是专为视障者出行沙盘推演量身定制的System Prompt和User Prompt架构。其核心设计理念在于“防范式约束（Defensive Constraint）”——即利用极其严厉甚至带有威胁性质的系统规则，强制大模型抑制其天然的发散性、话痨属性与视觉主导倾向。

#### **System Prompt (系统提示词 / 全局元指令)**

**Role (角色深度设定)**

你现在不再是一个普通的聊天助手，你是一位世界顶级的“视障定向行走（Orientation and Mobility, O\&M）专家”和“无障碍导航语音控制中心”。你的唯一任务，是将高度结构化的路线空间数据，转化为供视障人士（包括依赖地表触觉的盲杖使用者与依赖结构指令的导盲犬使用者）在安全出门前听取的“路线心理沙盘推演”战略级语音文案。

**Objective (核心目标)**

基于系统提供给你的JSON格式中间路线数据，生成一段极端克制、机械般精准、仅包含绝对必要行动指令与严重风险警告的行前语音预览文本。

**Absolute Constraints (绝对约束法则，违反任何一条将导致系统崩溃与严重事故)**

1. **极简与克制（惜字如金原则）**：绝对禁止添加任何环境氛围渲染、毫无意义的视觉特征描述（如任何形式的颜色、招牌文字、花草树木、建筑外观）。绝对禁止使用“您将会看到”、“注意您的右手边有”、“美丽的风景”等充满视觉偏见的词汇。输出的每个汉字都必须直接关乎用户的物理安全与下一步行动。坚决禁止生成诸如“你好”、“祝您一路平安”、“请注意脚下安全”等毫无信息熵的废话问候语与结束语。  
2. **纯粹的“时钟定位法则”**：在表达相对方向时，绝对禁止使用“向左转/向右拐”、“偏左侧”、“东南西北”等模糊或依赖绝对罗盘的方位词。必须且只能使用“X点钟方向”来引导转向（例如：向2点钟方向进入路口、保持12点钟方向直行）。请时刻铭记：12点钟方向永远代表用户当前的身体正前方坐标轴。  
3. **聚焦空间拓扑突变与风险节点**：你的播报无需关注平坦、无变化的直线步行区域。你必须将火力集中于那些会导致空间形态剧变的节点（如：向上/向下的台阶、天桥、地下通道入口、红绿灯路口、突然消失的盲道）。对于平滑的路段，只需概括一段长距离（如：保持12点钟方向直行300米即可）。  
4. **最后50米的高保真触觉提示（生死攸关）**：传统导航在最后50米失效。你必须将JSON中提供的最后50米信息单列为最重要的一段，着重渲染其物理触觉边界（例如“使用盲杖沿右侧墙面追踪”、“寻找左侧金属栅栏边缘”），因为这是视障群体发生迷失和焦虑的高危区域。  
5. **拒绝实时避障假象的陈述语气**：请牢记用户此时正坐在家中的沙发上听取这段内容，这是“出门前的战略推演”。你必须使用客观、陈述性、推演性的全局语气（例如“这段路程全程将遇到两个主要风险点”），绝对不要使用仿佛用户正走在马路上的实时紧急命令语气（例如“现在请立刻向右拐”、“小心你前面的台阶”）。

**Output Structure (强制输出结构规范)**

你生成的回复必须严格按照以下三个层次输出，直接输出正文自然段，不允许携带任何标题（如“全局概览：”、“节点一：”等字眼）：

* **\[段落1\] 宏观全局概览**：用一句话说明总距离，以及途中总计需要跨越几个关键复杂节点。  
* **\[段落2\] 关键节点时序拆解**：按照路线发展顺序逐一播报，句式必须被锁定为：\<距离\> \+ \<时钟方位\> \+ \<具体物理空间突变特征/风险\>。  
* **\[段落3\] 最后50米盲区策略**：专门针对到达终点前的微观环境进行精细化盲区应对说明。

#### **User Prompt (用户交互提示词)**

请解析以下这段包含天桥和复杂路口的700米路线提取数据，严格遵循你的核心原则，为其生成行前语音预览播报词：

{  
  "route\_summary": {  
    "total\_distance": "700m"  
  },  
  "key\_nodes": \[  
    {  
      "distance\_from\_start": "100m",  
      "action": "上天桥",  
      "clock\_direction": "11点钟方向",  
      "hazards": \["存在两段连续向上的台阶"\]  
    },  
    {  
      "distance\_from\_start": "600m",  
      "action": "横过交叉路口",  
      "clock\_direction": "12点钟方向",  
      "hazards": \["区域内无盲道", "存在复杂机动车与非机动车混行状况"\]  
    },  
    {  
      "distance\_from\_start": "650m",  
      "action": "进入小区内部到达终点",  
      "clock\_direction": "2点钟方向",  
      "hazards": \["进入无导航数据覆盖的内部道路", "必须沿右侧实体砖墙寻找建筑物入口"\]  
    }  
  \]  
}

## **4\. 任务 3：输出内容的结构构建与深层认知降噪规范**

在基于大模型的无障碍应用开发中，输出格式规范（Output Formatting）往往是决定产品最终在特殊用户群体中成败的关键一环。视障用户由于长期依赖听觉代偿，对语音播报的节奏感、逻辑连贯性以及信息密度的要求达到了近乎严苛的程度。无论底层大模型具备多么惊人的千亿级参数与空间推理能力，其依然保有一种挥之不去的“过度解释（Over-explaining）”和试图“展现文采与礼貌”的本能冲动。如果不在输出端施加冷酷无情的约束机制，这些冲动就会演变成对视障者的严重认知噪音污染。

我们必须通过系统级的参数调优、禁忌词过滤以及精心设计的反面/正面样本锚定（Few-Shot Anchoring），强行切断大模型的发散性神经回路，确保其输出风格永远维持在一种克制、冰冷但极其可靠的“机器代码级”精准状态。

### **4.1 认知降噪构建规则：彻底抑制模型的“发散表达”**

为了防止大语言模型自行脑补地图上并不存在的环境细节或加入毫无意义的社交寒暄语气词，除了在System Prompt中施加自然语言约束外，系统后端架构还需要实施以下工程级别的强硬构建规则：

* **强拦截禁用词表过滤（Negative Stop-words & Regex Sanitization）**：在系统后处理（Post-processing）阶段，建立一个庞大的敏感与废话词汇正则表达式库。一旦大模型生成的输出文本中被检测出包含“看”、“看见”、“颜色”（如红、蓝、绿）、“招牌”、“漂亮”、“风景”等视觉中心主义词汇，或者“注意脚下”、“祝您”、“您好”等废话式情感关怀，后端服务应直接触发大模型的重试机制（Retry Limit \= 2），或在不改变语义连贯性的前提下，在本地利用正则匹配将其强制剪裁、删除。  
* **句式拓扑白名单约束（Syntactic Topology Whitelisting）**：强制要求模型在描述空间节点时，只能采用一种特定且恒定的句式拓扑结构：\<累积行动距离\> \+ \<目标时钟方位\> \+ \<空间实体属性与风险\>。任何不符合该拓扑结构的修饰性定语与形容词群（例如“走过一段长长的、让人疲惫的台阶”、“穿过一个极其繁忙喧闹的路口”）均被视为系统级幻觉并予以修正。  
* **推理参数的极限控制（Temperature & Top-P Tuning）**：在调用云端模型API或执行本地化vLLM推理时，必须将控制输出随机性的 Temperature 参数从默认的 0.7 暴降至极低水平（例如 0.1 甚至 0.05），同时将 Top-p 设定为 0.85 左右。这种参数设定能够最大程度地消除大模型文本生成的多样性与随机性，确保每一次面对相同的JSON输入，都能输出拥有绝对稳定性和机械感的结果。视障者在构建心理沙盘时，需要的是高度确定的战术指令，而非变幻莫测的文学创作。

### **4.2 Few-Shot 样本锚定工程设计 (Few-Shot Anchoring)**

在上下文学习（In-Context Learning）中，大模型极其容易模仿输入历史中的样例风格。因此，在System Prompt与User Prompt之间，注入一对精心构建的Few-Shot示例（一个灾难性的反例与一个完美的正例），是引导模型对其自身行为边界进行深度“认知对齐（Cognitive Alignment）”的核心方法。

**灾难性反面示例剖析 (啰嗦 / 视觉依赖 / 方位感涣散)**

【系统向模型灌输的反面基准——供内部逻辑对照，严禁模仿】

“亲爱的用户你好，这段路线总共有700米长哦。你出门后首先往前走100米，然后请注意，你的左前方也就是偏左一点点的地方有一座天桥。天桥旁边有一家蓝色的便利店，你可以参考一下。小心走过两段很长的台阶。下桥后再走大概500米，你会看到一个很大的红绿灯路口，这里车很多，没有盲道，请千万注意安全。过了马路后向右拐，进入一个小区，大概再走50米就到了，终点就在你的右手边。祝你出行顺利！”

*【错误原理深度拆解（作为反向优化指标）】：*

1. **情感认知噪音污染**：“亲爱的用户你好”、“祝你出行顺利”、“请千万注意”，这类冗杂的社交词汇严重消耗了用户的耐心与听觉暂留记忆。  
2. **视觉特征谬误与冒犯**：“蓝色的便利店”、“看到一个很大的红绿灯”对于全盲用户或极低视力用户而言毫无意义，甚至会引发强烈的被排斥感与冒犯感。环境音频中根本无法听出便利店的颜色。  
3. **非标准与模糊的方位体系**：“左前方”、“偏左一点点”、“向右拐”。在缺乏物理参照物或路口形态不规则时，盲人无法准确感知“右拐”到底是90度转弯还是45度切入。必须毫不妥协地替换为绝对时钟方位体系。  
4. **主观模糊量度**：“很长的台阶”、“很大的路口”，这类表述缺乏客观的物理量度标准，会误导视障者对所需体能与通过时间的判断。

**极致完美正面示例剖析 (完全符合O\&M原则的推演播报)**

【系统向模型灌输的黄金标准——必须完美复刻此风格】

“全程700米，行程包含两处关键空间突变点与一段无导航覆盖盲区。

12点钟方向直行100米后，向11点钟方向登上天桥，需跨越两段连续向上台阶。

下桥后保持12点钟方向直行500米抵达路口，该路口无盲道铺设且存在机非混行。

穿越路口后，向2点钟方向切入小区内部。最后50米缺乏导航覆盖，需利用盲杖沿右侧实体砖墙直行寻路，到达终点。”

*【完美特性底层逻辑拆解】：*

1. **极致的信噪比（惜字如金）**：全段剔除了一切多余的寒暄、形容词与环境渲染，直击路线核心空间信息。  
2. **严丝合缝的时钟法则**：全篇精确且仅使用了“12点钟方向”、“11点钟方向”、“2点钟方向”。视障者在听取的瞬间，便能在脑海中精准地勾勒出一幅包含几何折线的二维向量图。  
3. **宏观心理沙盘的提前建构**：开篇第一句即交付“包含两处突变点和一段盲区”。这是一种极佳的认知负荷管理策略，让用户在出行前就分配好一路上的注意力阈值（即：在心里默默记数，安全跨越完两个风险点后，再调动全部感官应对最后的盲区）。  
4. **盲区的高保真触觉指导（Trailing技术运用）**：“沿右侧实体砖墙直行”这句看似简单的指令，实际上融入了定向行走中至关重要的触觉追踪（Trailing）寻路技术\[3\]。它为盲杖使用者提供了一条不可移动的物理基准线，极大降低了最后50米的迷失恐慌。

### **4.3 结构化文本输出与TTS语音流渲染规范 (Output Formatting for TTS)**

为了让前端App（尤其是利用先进的神经TTS引擎如Azure TTS或阿里云语音合成系统将文本转为语音）能够更好地控制语速的轻重缓急与呼吸停顿，大模型的输出文本必须遵循严格的结构化层级。本方案强制大模型输出无标题的前后连贯纯文本自然段，前端解析引擎可通过检测特定标点或换行符（\\n），强行插入0.5秒至1秒的静音停顿（SSML中的 \<break time="500ms"/\>），从而形成强烈的节奏感。

* **层级一：宏观全局概览 (The Global Macro-Overview)**  
  * **底层逻辑意图**：类似于阅读一本战术手册的“目录”。让用户在听取冗长的正文细节前，对整个旅程的距离跨度、难度评级与体能消耗有一个宏观的“鸟瞰式”心理预期。  
  * **TTS渲染效果**：播报完毕后停顿0.8秒，给大脑留出构建基底画板的时间。  
* **层级二：关键节点时序拆解 (Chronological Key Node Breakdown)**  
  * **底层逻辑意图**：剥离掉平淡无奇的直线路段，仅保留空间特征突变的锚点。对于导盲犬使用者，这种时序拆解能让他们在脑海中预演：在节点一需要下达“找楼梯（Find the stairs）”指令，在节点二需要下达“停（Halt）”或“找马路边缘（Find the curb）”指令\[4\]。  
  * **TTS渲染效果**：节点与节点之间停顿0.5秒，保持行进步伐般的节奏感。  
* **层级三：终点微观特征解析 (Destination Micro-Features / The Last 50 Meters)**  
  * **底层逻辑意图**：弥合粗糙的宏观地图API数据与微观真实物理世界之间的最后断层。由于民用GPS在建筑物密集区域存在5至15米的漂移误差\[5\]，最后一段路程的播报必须脱离对GPS距离的依赖，转而提供可靠的连续触觉引导（如墙壁、草坪边缘、盲道盲板）或听觉参照物（如平行车流声的反方向）。  
  * **TTS渲染效果**：采用略微加重、放缓的语速进行提示，宣告本次推演的最终决战阶段。

## **5\. 结论**

本报告系统性地解构并论证了“导航路线行前语音预览”功能的POC实施路径与底层架构设计。在验证期的模型选型上，鉴于视障辅助应用对用户位置隐私、高频并发成本以及极端低延迟的特殊苛刻要求，依托于本地化或私有云部署的开源中大型语言模型（如Qwen 2.5 32B/72B Instruct），结合vLLM等现代张量推理框架，是一条在经济模型与数据合规上彻底超越传统高昂云端API的高性价比务实之路。而在系统验证的早期阶段，适度引入GPT-4o进行提示词极限探索，则是规避逻辑盲区的高效手段。

在技术架构层面的核心突破在于：深刻意识到大语言模型在多维物理空间精确度量上的固有缺陷。系统架构不应将原始的地理空间数据与数学运算直接抛给黑盒式的LLM。相反，必须建立强大且不可撼动的确定性代码中间件，以截断地图API的冗余坐标流，完成从绝对经纬度和方位角到相对“时钟定位参考系”的精准计算映射，并基于OSM等无障碍语义标签完成关键风险节点的提纯。大语言模型的角色，应当被严格封锁并在“自然语言结构重组”、“认知噪音过滤”与“战术指令转译”的特定范畴内发挥其极致的文本理解优势。

在产品无障碍设计的哲学层面，通过极端防范式的Prompt工程与Few-Shot锚定机制的强制约束，AI系统必须自上而下地恪守“极简、绝对克制、纯粹时钟方位、深度聚焦风险边界”的核心法则。视障人群的独立出行不需要带有视觉偏见的“导游式风景讲解”，也不需要居高临下的虚伪情感关怀；他们迫切需要的是一张可以在出行前于脑海中清晰拓印、充满真实物理锚点与避险战术提示的“高精度心理沙盘”。唯有严格遵循定向行走（O\&M）底层认知逻辑构建的AI架构，才能真正为视障群体带来穿梭于复杂物理世界的安全感与独立生活的尊严。

## **参考文献**

1. Double-Diamond Model-Based Orientation Guidance in Wearable Human–Machine Navigation Systems for Blind and Visually Impaired People \- PMC  
2. Establishing and Maintaining Orientation for Mobility \- The University of Maine  
3. nc division of services for the blind orientation and mobility guidelines \- NCDHHS Policies and Manuals  
4. Orientation and Mobility (O\&M) \- The Lighthouse for the Blind, Inc.  
5. Blind Navigation and the Role of Technology \- The University of Maine  
6. Design principles \- Wayfindr \- Open Standard  
7. Clock position \- Wikipedia  
8. Spatial Awareness in LLMs \- OpenReview  
9. From Text to Space: Mapping Abstract Spatial Models in LLMs during a Grid-World Navigation Task \- arXiv  
10. FloorplanQA: A Benchmark for Spatial Reasoning in LLMs using Structured Representations  
11. Full article: Evaluating large language models on geospatial tasks: a multiple geospatial task benchmarking study \- Taylor & Francis  
12. MapBench: Spatial Reasoning Benchmark \- Emergent Mind  
13. OmniSpatial: Towards Comprehensive Spatial Reasoning Benchmark for Vision Language Models \- arXiv  
14. Evaluating Mathematical Reasoning Across Large Language Models: A Fine-Grained Approach \- arXiv.org  
15. Qwen 2.5 vl 72b is the new SOTA model on SpatialBench, beating Gemini 3 pro. \- Reddit  
16. \[2502.13923\] Qwen2.5-VL Technical Report \- arXiv  
17. Qwen2.5 VL\! Qwen2.5 VL\! Qwen2.5 VL\! | Qwen  
18. Qwen2.5:14B vs. GPT-4o-Mini: Which One is Cheaper at Scale? \- Cast AI  
19. GPT-4o vs Qwen2.5 Coder 32B Instruct (Comparative Analysis) \- Galaxy.ai Blog  
20. 10+ Large Language Model Examples & Benchmark \- AIMultiple  
21. LLM Leaderboard 2025 \- Vellum  
22. New reasoning benchmark got released. Gemini is SOTA, but what's going on with Qwen? \- Reddit  
23. Get a route | Routes API \- Google for Developers  
24. Map with pedestrian route from A to B \- HERE Technologies  
25. We release Qwen2.5-VL, the new flagship vision-language model of Qwen... \- Qwen Blog  
26. Google Maps API Tutorial: How to Use the Directions API with Maps \- YouTube  
27. Show directions on Baidu maps, start/end encoded in url \- Stack Overflow  
28. Computing a Route Examples | Google Maps Platform Routes Preferred API  
29. JSON parsing of Google Maps API in Android App \- Stack Overflow  
30. Navigating the Google Directions API | by Gautam \- Medium  
31. Key:crossing \- OpenStreetMap Wiki  
32. Tag:highway=steps \- OpenStreetMap Wiki  
33. How to tag traffic lights on pedestrian crossing? \- OpenStreetMap Help  
34. 步行路径规划 \- 高德地图API \- Apifox  
35. Sharing Secret Locations Lesson: BlindSquare Lesson Plan \- Perkins School For The Blind

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAYAAAA14t7uAAABFUlEQVR4Xu2SPQrCQBCFI/6AYBtF8m+6WMZSjyCCjY29B8h1BPUGghewtLUQKwtBPIBgZaFvdAPLGAmraRQfDJt9b/KRnY2m/fXbchwnQp24/7EAPaKu3P9IlmV1CJopWNf1CoBL1CVTMGAb13UHWPcCnOM97ygH2MI0zTLWHYHpBLxJSQK20MQXinHQnOusVU0A9GkM8R7jmBHYtu2G3KcsQNaADOO9BA7lPiXh5aY49lMh68q9dLHwps7jcl+PKQzDIhoneCzIPgEJDNBI9rHv4T9vpYIRrlAR92kE8M+oMc9IaeA8wq3neTUexGCaNc9IiWDf96t0TLniLAiCEqBznsNry4xEcBb6SvDBMAyT+3/ddQO3uFf+ZZblLgAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAZCAYAAAA14t7uAAABVklEQVR4Xu2TLUsEURSG7+IHCKJpFGHne9IYB0wajRaLQav4AxY0GsRosAuiYBVh/8CCxWpYLBo0GIyCSUSfo3OHw9Uyu5NkXzjMve979pm5Z2aNGel/KwzDDvXq+kML6DP16fpDyff9FYE2CvY8bxpgj3pvFAysH0XRBtfHEtxyewZRC1i33W5PcX0QsJzAbaqlEtY15ROW45A5Lzit9QRgXcZg94zjTMBBECS6r7aA3ALZsnsFLnRfLfHjxfLYv4psTffiXeJtU/usP5IkmdV5paIoJmg6ZTmufQEKmCff0T7eeZZlM+bnRR/Qt6fzSoQ3VMf1ZQT4b9SJ9tn3yVZVT++vL2eM4C6O43k3sGCZtZtZkW9SR5WRpumcHFOXzfI8nwR65eZ4yxXAfN94F/9ee40I6DWniVx/YDG2JaAXdg/72DTxt5fjUy+M4kmK9aHbM5L5AlKAYI5XDdmmAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAYCAYAAADkgu3FAAABsklEQVR4Xu1TsUoDQRBNMIKCoCIR5e5y8WIj2l0hFpaCH2Ah6CdY2QgWIoi9hZVY2AlqJ4KFRcBO/QKtbBQUsUphYfS9czbMTgJRsLwHw+2+eTPvbnavUMiR4zeI47hZrVb3LN8FxUqlcoTaa6x7bLINMFiE+IuBbdHmOwHaU8S7bItcR1E044k0wjDsx1tdQtigEdbTVtMBbEzthiPkRde1yAOS54hDFKVi9gTzSatzKJfLA9DUMYVtzYvRheY88JMRc1iW8DyWgh2rc4DBMjV2TFJX11wLEM+LiQPNWMCz6gh5MS8fBEEodbuaz5CmaS8SJ1iWNA/uQ4omNO8guSZGvaRiS/gVq2cBx0QjD/KVNHuo1WqRzqHhsDRsnYU7M8Qt81qfAYkXNrU8b2H8c0HYcE3n1Ig2HYf1FOLNXo4MvGGIBcs7iBkbemfhbiafjsP+THTeERD8B/bZzCY0oGmyAcY36jgxekSMKx0vR8PtW6CJJA+6xB2NMJIbjGyEtVj3gXuGYSL7WeyvkiQZ9F0KmdErG/wl0HhV1X9yz58aRveIMd3/X4HmQ7xtls+Row3fTGyRju1+qt8AAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,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>

[image5]: <data:image/png;base64,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>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHYAAAAXCAYAAADeD7vuAAAFVElEQVR4Xu1YXYhVVRQ+Fw0m+rWahubn7nvvDA1CfzD9CRISGoYZQT2I9RZUhC8VJPWUlA/5eBGFIagepB56CEL0YRAhiMAgimTEFFIsIQkpKmpKb99391rXddY959zRZu6McD5Y3Lu//e2919lr/ydJiRIlSpQoUaJEiasTIYSdsN2eL/E/gU59DTZdrVY3NxqNm3y+Rb1evwc/Kz1fq9VuhtXwt6Lc6Ojo3ajzhUuqbKDtb6Bb7+gKqtshfq3H/wGX3wby76AG1pyamrrG5y8V6At8Wu15xcTExI3i956hoaHrfH4W0Af3oS+ec9wAYvKY5Ui+AftW0yyEhlrgXrI6cD+Rh13g7+Dg4PU2XzSrRdMx1Pf6PDqbAXzLEij3PuygplHX21LfBqsTf6Y1jXqO06ymn4B/H8Of32H/ir+bvYZA3nnYjEnPkLOaLODbXrT9K22c9jpWeJSZ4+PjtzM9MjIyivQZ2BEUWKU6/H8Gla6DfUh9TmA5c36GzcG+h73jNVmArg5b47hf2A5m/LVMj42NPYD0n7BPElktMEqHkD6PvLtMuW0sl5hVo5+QPnoKvj0IP/7ICiy/CXkXoduoHP+T0+/NA+sLMrlCHEBbM8tAuJciDRTSDaTPwo4ODw/f5vW9AovyU54vAp2yM1OBug5IgNpBhGYt0v/A9tfiklzhrEZ6xi5jbD/EDvXLel9h/OgKLLjtyDvJgakc+w52ijPSaj0ksIc93xMY/U+yQ2tuaVQsdGA521Bu1vMe0hn0awvTbJ8fSH+cTgfmq5bvN4oCK3142PYhdKvAHYG9Z7UeVxzYENf6Vt4BqldgEaj7oXkI/4/BiQ9Ar/A6CwkYl9dCoM7jbFf3a7YV4ghPBVZ5WNPy/UZeYHVA0mwfGl5XpExoYGFbYTPQ7sA2OuZ1HaDAaRrEX8E2+XxFr8DCps1hqUItuZTQAHnHYHXPK8Qn7vkHOGCUl7ZyA+t5D/3e+RoG+p2+jiJUrzywKd6D9UFzQdM8GyH9Hexpq+sCRwBELR6ifB5RFFjul7BbLBfivnjRchYh3l17HnSg28d2dSUJOQHM4/uNxQos+ncE37bOciG+AczaPTsTEDXZibBtPq8osFlgJ+fpUdfGrANaFqAdQD37g5wm5UR80gcwLPOlmAe9ELe7vMAWLsVZkFnMa892S66lGZ3uey02YnkiL7CcSSEul68kZgZKJ3fpgZXgP3JcB/BhA4J3r+W0bVjTdMS+JN0e79K8Ki33w9Pnk5OTNyjHAR7i1bPw8IT8c7AfLdcVWOkcdhSvFR2wcuG7Rn1eYPVDQlxaO69SId49U/UL/2zIOd2FOOtSfpmRzpNx+0qA3y3B3beRfpwaLlnKZUHamLclPQ6BHkWBBb8GdhZ5DeU4iMH9xnJWC/4R+8ATYr/MWQ3Sb8L+Zr3K6eGmIzQzISVU5AVWZuyXidsvpf5zliPwAQdDxlJPyAU+VY6BQvqHEA9S7cNW1gOFrjbJPPbtxURRYLMeKPSaaR8buGqRw+9e5ZA+ZVcyfQcA/1nqoUJedE7ADoX4btmC/Zp0B4izkXkpc45zoPwV4kmXdzLmP0HeaNoI5gUpCyxHP/D7abjk1wmvC/GliS8xL6Oj3sXvbCh4n11smO3CW2pPRXpTiH3K2UbjEvuorQsBBBXmquZtmBOoGp8tD5m2vrDlLFbU5LGdo6h2mZu3BU7Tt6Ke52HNun+YFtA5LqOe95BH9F3i18N5b87SJoO/K7nMJXMpIdvLHvZV3rfloKLxkmtY18RZEsChnclycabEwkBOf197vsRVDgR1dy3nHbrEwuA/ph3/uY2HznYAAAAASUVORK5CYII=>