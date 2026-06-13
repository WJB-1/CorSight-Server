以下是根据你提供的详细内容整理的 **Markdown 格式** 说明文档，保留了所有核心信息、结构层次和代码示例。

```markdown
# 阿里云百炼批量推理使用指南

对于无需实时响应的推理场景，批量推理能异步处理大批量的数据请求，成本仅为实时推理的 **50%**，且接口兼容 OpenAI，适合执行模型评测、数据标注等批量作业。

## 工作原理

1. **提交任务**：上传包含多个请求的 JSONL 文件，创建批量推理任务。
2. **异步处理**：系统在后台队列中处理任务。可通过控制台或 API 查询任务进度和状态。
3. **下载结果**：任务完成后，系统生成结果文件（记录成功响应）和错误文件（记录失败详情，如有）。

## 适用范围

- **中国内地**：服务部署范围为中国内地时，模型推理计算资源仅限于中国内地；静态数据存储于您所选的地域。该部署范围支持的地域：**华北2（北京）**。
- **国际**：同样支持。

## 支持的模型

- **文本生成模型**：千问 Max、Plus、Flash、Long 的稳定版本及其部分 latest 版本，以及部分第三方模型（deepseek-r1、deepseek-v3.2、deepseek-v3）。
- **多模态模型**：千问 VL Plus、Flash、OCR 的稳定版本及其部分 latest 版本。
- **文本向量模型**：所有版本的 text-embedding 模型。

> **重要**
> - 在 Batch 场景下，`qwen3.7-max`、`qwen3.7-plus`、`qwen3.6-plus`、`qwen3.6-flash`、`qwen3.5-plus` 和 `qwen3.5-flash` 单次请求的上下文 Token 数最大支持 **256K**。
> - 部分模型支持思考模式，开启后会产生思考 tokens 导致成本增加。
> - `qwen3.7-max`、`qwen3.6` 和 `qwen3.5` 系列模型默认开启思考模式。建议使用混合思考模型时，显式设置 `enable_thinking` 参数（true 开启 / false 关闭）。
> - 在 JSONL 请求体中，`enable_thinking` 为 body 的顶层参数，须与 `model` 同级传入，不能放在 `extra_body` 中。

## 使用批量推理

### 步骤一：准备输入文件

创建任务前，准备一个符合以下规范的 **JSONL** 文件：

- **格式**：UTF-8 编码的 JSONL（每行一个独立 JSON 对象）。
- **规模限制**：单文件 ≤ 50,000 个请求，且 ≤ 500 MB。数据量超出此限制时，拆分为多个任务分别提交。
- **单行限制**：每个 JSON 对象 ≤ 6 MB，且不超过模型上下文长度。
- **一致性要求**：同一文件内所有请求须使用相同模型及思考模式（如适用）。
- **唯一标识**：每个请求必须包含文件内唯一的 `custom_id` 字段，用于结果匹配。`custom_id` 最大支持 256 个字符。如需回传更长的标识信息，可在创建任务时通过 `metadata` 的自定义字段实现。

#### 字段规范

| 字段         | 类型   | 是否必填 | 说明                                                         |
| ------------ | ------ | -------- | ------------------------------------------------------------ |
| `custom_id`  | string | 是       | 请求的唯一标识符                                             |
| `method`     | string | 是       | HTTP 方法，仅支持 `POST`                                     |
| `url`        | string | 是       | 请求端点，仅支持 `/v1/chat/completions`                      |
| `body`       | object | 是       | 请求体，格式与 `/v1/chat/completions` 接口一致               |

#### 示例文件（test_model.jsonl）

```jsonl
{"custom_id":"1","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-max","messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"你好！有什么可以帮助你的吗？"}]}}

{"custom_id":"2","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-max","messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is 2+2?"}]}}
```

#### 在批量推理中配置思考模式

部分模型（如 `qwen3.5-plus`、`qwen3.5-flash`）默认开启思考模式。如需配置，请在 JSONL 文件的 `body` 中与 `model` 同级设置 `enable_thinking` 参数。可选参数 `thinking_budget` 用于限制思考 Token 数量上限。

> **重要**：`enable_thinking` 和 `thinking_budget` 必须直接放在 `body` 最外层（与 `model` 同级）。请勿放入 `extra_body` 中。

**示例：关闭思考模式**

```jsonl
{"custom_id":"request-1","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen3.5-plus","enable_thinking":false,"messages":[{"role":"user","content":"你好"}]}}
```

**示例：开启思考模式并限制思考 Token 预算**

```jsonl
{"custom_id":"request-2","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen3.5-plus","enable_thinking":true,"thinking_budget":50,"messages":[{"role":"user","content":"请分析以下问题"}]}}
```

### 步骤二：创建批量推理任务

1. 在**批量推理**页面，单击 **创建批量推理任务**。
2. 在弹出的对话框中：
   - 填写任务名称和描述
   - 设置最长等待时间（1–14 天）
   - 上传 JSONL 文件
3. 单击 **确认**。

> 可单击“下载示例文件”获取模板。

### 步骤三：监控和管理任务

- **查看**：在任务列表页查看任务进度（已处理请求数/总请求数）和状态。可按任务名称/ID搜索，或按业务空间筛选。
- **管理**：
  - 取消：执行中的任务可在操作列取消。
  - 排错：失败的任务可悬停状态查看错误概要，下载错误文件查看详情。

### 步骤四：下载结果

任务完成后，单击 **查看结果**，下载产出文件：

- **结果文件**：记录所有成功请求及其 response 结果。
- **错误文件**（如有）：记录所有失败请求及其 error 详情。

两个文件均包含 `custom_id` 字段，用于与原始输入数据匹配。

### 步骤五：查看用量统计（可选）

在**模型用量**页面：

- 选择时间范围（最长 30 天），将**推理类型**选为**批量推理**，查看数据概览。
- 单击模型类别（如大语言模型）进入详情页，同样筛选批量推理查看调用信息。
- 单击目标模型的“查看详情”查看单模型调用情况。

> **重要**
> - 批量推理的调用数据以任务结束时间为准进行统计。正在运行的任务无法查询。
> - 监控数据存在 1～2 小时延迟。

## 使用 metadata 回传自定义标识

`custom_id` 最大支持 256 个字符。如需回传更长的标识信息，可使用 `metadata` 的自定义字段。

### metadata 字段说明

- `ds_name`：任务名称，显示在控制台。
- `ds_description`：任务描述，显示在控制台。
- **自定义字段**：除上述官方字段外，任意自定义字段的值不受 256 字符限制。查询任务详情时会完整回传。

### 代码示例

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

batch = client.batches.create(
    input_file_id="file-batch-xxxxxxxxxxxxxxxxxxxx",
    endpoint="/v1/chat/completions",
    completion_window="24h",
    metadata={
        "ds_name": "my_batch_task",
        "ds_description": "批量推理任务描述",
        "my_custom_field": "此字段的值可以超过256个字符，用于回传更长的标识信息..."
    }
)
print(batch)
```

## API 参考

在生产环境中，使用兼容 OpenAI 的 API 自动化创建和管理 Batch 任务。核心流程：

1. **上传文件**：调用 `POST /v1/files`，记录返回的 `file_id`。
2. **创建任务**：传入文件 ID 或 OSS 路径，调用 `POST /v1/batches`，记录返回的 `batch_id`。
3. **轮询状态**：使用 `batch_id` 轮询 `GET /v1/batches/{batch_id}`。当 `status` 变为 `completed` 时，记录 `output_file_id`。
4. **下载结果**：使用 `output_file_id` 调用 `GET /v1/files/{output_file_id}/content`。

完整的 Batch API 接口定义和代码示例，请参见 **OpenAI兼容-Batch（文件输入）**。

### 任务生命周期

| 状态             | 说明                                                         |
| ---------------- | ------------------------------------------------------------ |
| `validating`     | 系统正在校验文件格式及每行请求的 API 格式合法性。            |
| `in_progress`    | 文件验证通过，系统已开始逐行处理推理请求。                   |
| `finalizing`     | 所有请求均已处理完毕，结果正在分别写入结果文件和错误文件。   |
| `completed`      | 结果文件和错误文件已写入完成，可下载。                       |
| `failed`         | 任务在 `validating` 阶段失败，通常由文件级错误导致。不执行任何推理，不生成结果文件。 |
| `expired`        | 任务运行时间超过设定的最长等待时间，被系统终止。             |
| `cancelled`      | 任务已取消，未开始处理的请求将被终止。                       |

## 计费说明

- **计费单价**：所有成功请求的输入和输出 Token，单价均为对应模型实时推理价格的 **50%**（具体请参见模型列表）。
- **计费范围**：
  - 仅对任务中成功执行的请求计费。
  - 文件解析失败、任务执行失败、行级错误请求均不产生费用。
  - 被取消的任务中，取消前已成功完成的请求正常计费。

> **说明**
> - 批量推理为独立计费项，支持 AI 通用型节省计划，但不支持预付费（节省计划）、新人免费额度等优惠，以及上下文缓存等功能。
> - 部分模型（如 `qwen3.5-plus`、`qwen3.5-flash`）默认开启思考模式，会产生额外思考 Token，并按输出 Token 价格计费。建议根据任务复杂度设置 `enable_thinking` 参数以控制成本。

## 常见问题

**使用批量推理需要额外购买或开通吗？**  
不需要。开通阿里云百炼服务后即可使用，费用按后付费模式从账户余额中扣除。

**任务提交后为什么立即失败（状态变为 `failed`）？**  
通常是文件级错误导致，未执行任何推理请求。请按以下顺序排查：
- 文件格式：是否为严格的 JSONL 格式。
- 文件规模：大小、行数是否超出限制。
- 模型一致性：所有请求的 `body.model` 是否一致，且为当前地域支持的模型。

**任务处理需要多长时间？**  
主要取决于系统负载。任务会在设定的最长等待时间内返回结果（成功或失败）。

## 错误码

如果调用失败并返回报错信息，请参见[错误码](https://help.aliyun.com/zh/model-studio/error-code)进行解决。
