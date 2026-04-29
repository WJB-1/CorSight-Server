(venv) PS D:\project_file\CorSight_Navigation\agent_demo\3.0\debug> python test_gemini_multimodal.py
Gemini 多模态模型测试 (新版 API)
============================================================
API Key: AIzaSyCKoq...

找到 4 个 Gemini 模型:
  1. gemini-3.1-pro-preview
  2. gemini-3-flash-preview
  3. gemini-3.1-flash-lite-preview
  4. gemini-robotics-er-1.5-preview

测试图片: D:\project_file\CorSight_Navigation\agent_demo\3.0\debug\test.png
图片存在: 是

提示词: 请分析这张图片并详细描述：
1. 图片中主要包含什么内容？
2. 图片的色彩、构图和风格特点是什么？
3. 如果这是一张街景或导航相关的图片，请指出其中的道路、建筑、标志物等关键元素。
4. 为视觉障...

============================================================
测试模型: gemini-3.1-pro-preview
============================================================
✗ 模型测试失败: ClientError: 429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro\nPlease retry in 3.622059491s.', 'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': 'type.googleapis.com/google.rpc.Help', 'links': [{'description': 'Learn more about Gemini API quotas', 'url': 'https://ai.google.dev/gemini-api/docs/rate-limits'}]}, {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_requests', 'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'quotaDimensions': {'location': 'global', 'model': 'gemini-3.1-pro'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_requests', 'quotaId': 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 'quotaDimensions': {'model': 'gemini-3.1-pro', 'location': 'global'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count', 'quotaId': 'GenerateContentInputTokensPerModelPerMinute-FreeTier', 'quotaDimensions': {'location': 'global', 'model': 'gemini-3.1-pro'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count', 'quotaId': 'GenerateContentInputTokensPerModelPerDay-FreeTier', 'quotaDimensions': {'model': 'gemini-3.1-pro', 'location': 'global'}}]}, {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '3s'}]}}

============================================================
测试模型: gemini-3-flash-preview
============================================================
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
✓ 模型响应成功 (耗时: 12.59s)
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
响应长度: 869 字符
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
响应预览: 以下是对这张图片的详细分析：

### 1. 图片主要内容
这张图片展现了中国上海一个深秋或初冬时节的城市街景。画面中心是一条铺设着红色塑胶材质的非机动车道或步道，道路中央有一条醒目的黄色**盲道**。一名骑行者正骑着蓝色自行车沿着道路向远方驶去。道路两旁种满了高大的落叶乔木（银杏和水杉），地面铺满了金黄色的落叶。左侧停着一辆写有“上海市保安服务有限公司”字样的白色运钞车或安保车辆，远处则是城市建...
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.

============================================================
测试模型: gemini-3.1-flash-lite-preview
============================================================
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
✓ 模型响应成功 (耗时: 5.92s)
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
响应长度: 703 字符
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
响应预览: 这张图片展示了一个深秋时节的城市街道景象，以下是对图片的详细分析：

### 1. 图片中主要包含什么内容？
画面主体是一条城市人行道及自行车道。左侧停放着一辆白色的“上海市保安服务有限公司”的专用车辆，旁边路边停靠着一辆蓝色的共享单车。道路中央有一名骑自行车的行人正向远方驶去。地面上铺满了深秋季节掉落的黄色银杏叶，树木呈现出金黄色和棕红色，充满了季节感。

### 2. 图片的色彩、构图和风格特...
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.
Warning: there are non-text parts in the response: ['thought_signature'], returning concatenated text result from text parts. Check the full candidates.content.parts accessor to get the full model response.

============================================================
测试模型: gemini-robotics-er-1.5-preview
============================================================
✓ 模型响应成功 (耗时: 28.53s)
响应长度: 1047 字符
响应预览: 根据对图片的分析，以下是详细描述：

**1. 图片中主要包含什么内容？**

*   **中心主体：** 一条在城市绿化带中蜿蜒伸展的红色步行/骑行道。路面上散落着大量的金黄色落叶，营造出浓郁的秋日氛围。一位骑自行车的人正沿着这条小路向前骑行。
*   **周围环境：** 小路两侧是茂密的树木。左侧的树木（可能是银杏）叶子大部分已转为黄色，部分脱落；右侧的树木则有深红棕色和常绿灌木。在小路左侧平...

============================================================
测试结果汇总
============================================================
成功: 3/4
失败: 1/4

成功的模型:
  ✓ gemini-3-flash-preview
  ✓ gemini-3.1-flash-lite-preview
  ✓ gemini-robotics-er-1.5-preview

失败的模型:
  ✗ gemini-3.1-pro-preview: ClientError: 429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.goog

详细结果已保存到: D:\project_file\CorSight_Navigation\agent_demo\3.0\debug\gemini_multimodal_test_results.txt

============================================================
建议:
1. 以下模型可用于多模态导航预览系统:
   - gemini-3-flash-preview
   - gemini-3.1-flash-lite-preview
   - gemini-robotics-er-1.5-preview