# Gemini CLI 可观测性指南

遥测提供有关 Gemini CLI
性能、健康状况和使用情况的数据。启用遥测后，您可以通过跟踪、指标和结构化日志来监控操作、调试问题和优化工具使用。

Gemini CLI 的遥测系统建立在 **[OpenTelemetry] (OTEL)**
标准之上，允许您将数据发送到任何兼容的后端。

[OpenTelemetry]: https://opentelemetry.io/

## 启用遥测

您可以通过多种方式启用遥测。配置主要通过
[`.gemini/settings.json` 文件](./cli/configuration.zh.md) 和环境变量进行管理，但
CLI 标志可以覆盖特定会话的这些设置。

### 优先顺序

以下列表列出了应用遥测设置的优先顺序，列表中位置越高的项目优先级越高：

1. **CLI 标志 (用于 `gemini` 命令):**

   - `--telemetry` / `--no-telemetry`: 覆盖 `telemetry.enabled`。
   - `--telemetry-target <local|gcp>`: 覆盖 `telemetry.target`。
   - `--telemetry-otlp-endpoint <URL>`: 覆盖 `telemetry.otlpEndpoint`。
   - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: 覆盖
     `telemetry.logPrompts`。

1. **环境变量:**

   - `OTEL_EXPORTER_OTLP_ENDPOINT`: 覆盖 `telemetry.otlpEndpoint`。

1. **工作区设置文件 (`.gemini/settings.json`):** 来自此项目特定文件中
   `telemetry` 对象的值。

1. **用户设置文件 (`~/.gemini/settings.json`):** 来自此全局用户文件中
   `telemetry` 对象的值。

1. **默认值:** 如果上述任何一项均未设置，则应用默认值。
   - `telemetry.enabled`: `false`
   - `telemetry.target`: `local`
   - `telemetry.otlpEndpoint`: `http://localhost:4317`
   - `telemetry.logPrompts`: `true`

**对于 `npm run telemetry -- --target=<gcp|local>` 脚本:** 此脚本的 `--target`
参数 _仅_ 在该脚本的持续时间和目的内覆盖
`telemetry.target`（即，选择要启动的收集器）。它不会永久更改您的
`settings.json`。该脚本将首先查看 `settings.json` 中的 `telemetry.target`
以用作其默认值。

### 示例设置

可以将以下代码添加到您的工作区 (`.gemini/settings.json`) 或用户
(`~/.gemini/settings.json`) 设置中，以启用遥测并将输出发送到 Google Cloud：

```json
{
    "telemetry": {
        "enabled": true,
        "target": "gcp"
    },
    "sandbox": false
}
```

## 运行 OTEL 收集器

OTEL 收集器是接收、处理和导出遥测数据的服务。 CLI 使用 OTLP/gRPC 协议发送数据。

在[文档][otel-config-docs]中了解有关 OTEL 导出器标准配置的更多信息。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### 本地

使用 `npm run telemetry -- --target=local`
命令自动执行设置本地遥测管道的过程，包括在 `.gemini/settings.json`
文件中配置必要的设置。底层脚本安装 `otelcol-contrib`（OpenTelemetry 收集器）和
`jaeger`（用于查看跟踪的 Jaeger UI）。要使用它：

1. **运行命令**: 从存储库的根目录执行命令：

   ```bash
   npm run telemetry -- --target=local
   ```

   该脚本将：

   - 如果需要，下载 Jaeger 和 OTEL。
   - 启动本地 Jaeger 实例。
   - 启动配置为从 Gemini CLI 接收数据的 OTEL 收集器。
   - 在您的工作区设置中自动启用遥测。
   - 退出时，禁用遥测。

1. **查看跟踪**: 打开您的网络浏览器并导航到 **http://localhost:16686** 以访问
   Jaeger UI。在这里，您可以检查 Gemini CLI 操作的详细跟踪。

1. **检查日志和指标**: 该脚本将 OTEL 收集器输出（包括日志和指标）重定向到
   `~/.gemini/tmp/<projectHash>/otel/collector.log`。该脚本将提供用于在本地查看和跟踪遥测数据（跟踪、指标、日志）的链接和命令。

1. **停止服务**: 在运行脚本的终端中按 `Ctrl+C` 以停止 OTEL 收集器和 Jaeger
   服务。

### Google Cloud

使用 `npm run telemetry -- --target=gcp` 命令自动设置一个将数据转发到您的 Google
Cloud 项目的本地 OpenTelemetry 收集器，包括在您的 `.gemini/settings.json`
文件中配置必要的设置。底层脚本安装 `otelcol-contrib`。要使用它：

1. **先决条件**:

   - 拥有一个 Google Cloud 项目 ID。
   - 导出 `GOOGLE_CLOUD_PROJECT` 环境变量，使其可用于 OTEL 收集器。
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
     ```
   - 使用 Google Cloud 进行身份验证（例如，运行
     `gcloud auth application-default login` 或确保已设置
     `GOOGLE_APPLICATION_CREDENTIALS`）。
   - 确保您的 Google Cloud 帐户/服务帐户具有必要的 IAM 角色："Cloud Trace
     Agent"、"Monitoring Metric Writer"和"Logs Writer"。

1. **运行命令**: 从存储库的根目录执行命令：

   ```bash
   npm run telemetry -- --target=gcp
   ```

   该脚本将：

   - 如果需要，下载 `otelcol-contrib` 二进制文件。
   - 启动一个 OTEL 收集器，该收集器配置为从 Gemini CLI
     接收数据并将其导出到您指定的 Google Cloud 项目。
   - 在您的工作区设置 (`.gemini/settings.json`) 中自动启用遥测并禁用沙盒模式。
   - 提供在 Google Cloud 控制台中查看跟踪、指标和日志的直接链接。
   - 退出时 (Ctrl+C)，它将尝试恢复您原来的遥测和沙盒设置。

1. **运行 Gemini CLI:** 在单独的终端中，运行您的 Gemini CLI
   命令。这将生成遥测数据，收集器会捕获这些数据。

1. **在 Google Cloud 中查看遥测**: 使用脚本提供的链接导航到 Google Cloud
   控制台并查看您的跟踪、指标和日志。

1. **检查本地收集器日志**: 该脚本将本地 OTEL 收集器输出重定向到
   `~/.gemini/tmp/<projectHash>/otel/collector-gcp.log`。该脚本提供用于在本地查看和跟踪收集器日志的链接和命令。

1. **停止服务**: 在运行脚本的终端中按 `Ctrl+C` 以停止 OTEL 收集器。

## 日志和指标参考

以下部分描述了为 Gemini CLI 生成的日志和指标的结构。

- `sessionId` 作为所有日志和指标的通用属性包含在内。

### 日志

日志是特定事件的带时间戳的记录。为 Gemini CLI 记录以下事件：

- `gemini_cli.config`: 此事件在启动时使用 CLI 的配置发生一次。

  - **属性**:
    - `model` (字符串)
    - `embedding_model` (字符串)
    - `sandbox_enabled` (布尔值)
    - `core_tools_enabled` (字符串)
    - `approval_mode` (字符串)
    - `api_key_enabled` (布尔值)
    - `vertex_ai_enabled` (布尔值)
    - `code_assist_enabled` (布尔值)
    - `log_prompts_enabled` (布尔值)
    - `file_filtering_respect_git_ignore` (布尔值)
    - `debug_mode` (布尔值)
    - `mcp_servers` (字符串)

- `gemini_cli.user_prompt`: 当用户提交提示时发生此事件。

  - **属性**:
    - `prompt_length`
    - `prompt` (如果 `log_prompts_enabled` 配置为 `false`，则排除此属性)

- `gemini_cli.tool_call`: 此事件针对每个函数调用发生。

  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (布尔值)
    - `decision` (字符串: "accept", "reject", 或 "modify", 如果适用)
    - `error` (如果适用)
    - `error_type` (如果适用)

- `gemini_cli.api_request`: 向 Gemini API 发出请求时发生此事件。

  - **属性**:
    - `model`
    - `request_text` (如果适用)

- `gemini_cli.api_error`: 如果 API 请求失败，则发生此事件。

  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`

- `gemini_cli.api_response`: 从 Gemini API 收到响应时发生此事件。

  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (可选)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (如果适用)

### 指标

指标是随时间推移的行为的数值度量。为 Gemini CLI 收集以下指标：

- `gemini_cli.session.count` (计数器, 整数): 每个 CLI 启动时递增一次。

- `gemini_cli.tool.call.count` (计数器, 整数): 统计工具调用次数。

  - **属性**:
    - `function_name`
    - `success` (布尔值)
    - `decision` (字符串: "accept", "reject", 或 "modify", 如果适用)

- `gemini_cli.tool.call.latency` (直方图, 毫秒): 测量工具调用延迟。

  - **属性**:
    - `function_name`
    - `decision` (字符串: "accept", "reject", 或 "modify", 如果适用)

- `gemini_cli.api.request.count` (计数器, 整数): 统计所有 API 请求次数。

  - **属性**:
    - `model`
    - `status_code`
    - `error_type` (如果适用)

- `gemini_cli.api.request.latency` (直方图, 毫秒): 测量 API 请求延迟。

  - **属性**:
    - `model`

- `gemini_cli.token.usage` (计数器, 整数): 统计使用的令牌数。

  - **属性**:
    - `model`
    - `type` (字符串: "input", "output", "thought", "cache", 或 "tool")

- `gemini_cli.file.operation.count` (计数器, 整数): 统计文件操作次数。

  - **属性**:
    - `operation` (字符串: "create", "read", "update"): 文件操作的类型。
    - `lines` (整数, 如果适用): 文件中的行数。
    - `mimetype` (字符串, 如果适用): 文件的 Mimetype。
    - `extension` (字符串, 如果适用): 文件的文件扩展名。

</rewritten_file>
