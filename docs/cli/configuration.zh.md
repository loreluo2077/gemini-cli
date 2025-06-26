# Gemini CLI 配置

Gemini CLI
提供多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置。

## 配置层级

配置按以下优先顺序应用（数字越小，越容易被数字大的覆盖）：

1. **默认值：** 应用程序中硬编码的默认值。
2. **用户设置文件：** 当前用户的全局设置。
3. **项目设置文件：** 特定于项目的设置。
4. **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
5. **命令行参数：** 启动 CLI 时传递的值。

## 用户设置文件和项目设置文件

Gemini CLI 使用 `settings.json` 文件进行持久化配置。这些文件有两个位置：

- **用户设置文件：**
  - **位置：** `~/.gemini/settings.json` (其中 `~` 是您的主目录)。
  - **范围：** 适用于当前用户的所有 Gemini CLI 会话。
- **项目设置文件：**
  - **位置：** 项目根目录中的 `.gemini/settings.json`。
  - **范围：** 仅在从该特定项目运行 Gemini CLI 时适用。项目设置会覆盖用户设置。

**关于设置中环境变量的说明：** `settings.json` 文件中的字符串值可以使用
`$VAR_NAME` 或 `${VAR_NAME}`
语法引用环境变量。这些变量将在加载设置时自动解析。例如，如果您有一个环境变量
`MY_API_TOKEN`，您可以在 `settings.json`
中像这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.gemini` 目录

除了项目设置文件外，项目的 `.gemini` 目录还可以包含与 Gemini CLI
操作相关的其他特定于项目的文件，例如：

- [自定义沙盒配置文件](#sandboxing) (例如, `.gemini/sandbox-macos-custom.sb`,
  `.gemini/sandbox.Dockerfile`)。

### `settings.json` 中的可用设置：

- **`contextFileName`** (字符串或字符串数组):

  - **描述：** 指定上下文文件的文件名（例如
    `GEMINI.md`、`AGENTS.md`）。可以是单个文件名或接受的文件名列表。
  - **默认值：** `GEMINI.md`
  - **示例：** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (对象):

  - **描述：** 覆盖 `/bug` 命令的默认 URL。
  - **默认值：**
    `"urlTemplate": "https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **属性：**
    - **`urlTemplate`** (字符串): 可以包含 `{title}` 和 `{info}` 占位符的 URL。
  - **示例：**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (对象):

  - **描述：** 控制 @ 命令和文件发现工具的 git 感知文件过滤行为。
  - **默认值：** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **属性：**
    - **`respectGitIgnore`** (布尔值): 在发现文件时是否遵循 .gitignore
      模式。当设置为 `true` 时，git 忽略的文件（如
      `node_modules/`、`dist/`、`.env`）会自动从 @ 命令和文件列表操作中排除。
    - **`enableRecursiveFileSearch`** (布尔值): 在提示中完成 @
      前缀时，是否启用在当前树下递归搜索文件名。
  - **示例：**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (字符串数组):

  - **描述：**
    允许您指定应提供给模型的核心工具名称列表。这可用于限制内置工具集。有关核心工具列表，请参阅[内置工具](../core/tools-api.zh.md#built-in-tools)。
  - **默认值：** 所有可供 Gemini 模型使用的工具。
  - **示例：** `"coreTools": ["ReadFileTool", "GlobTool", "SearchText"]`。

- **`excludeTools`** (字符串数组):

  - **描述：** 允许您指定应从模型中排除的核心工具名称列表。同时在 `excludeTools`
    和 `coreTools` 中列出的工具将被排除。
  - **默认值**: 不排除任何工具。
  - **示例：** `"excludeTools": ["run_shell_command", "findFiles"]`。

- **`autoAccept`** (布尔值):

  - **描述：** 控制 CLI
    是否自动接受和执行被认为是安全的操作（例如只读操作），而无需用户明确确认。如果设置为
    `true`，CLI 将绕过对被认为是安全的工具的确认提示。
  - **默认值：** `false`
  - **示例：** `"autoAccept": true`

- **`theme`** (字符串):

  - **描述：** 设置 Gemini CLI 的视觉[主题](./themes.zh.md)。
  - **默认值：** `"Default"`
  - **示例：** `"theme": "GitHub"`

- **`sandbox`** (布尔值或字符串):

  - **描述：** 控制是否以及如何使用沙盒执行工具。如果设置为 `true`，Gemini CLI
    将使用预构建的 `gemini-cli-sandbox` Docker
    镜像。有关更多信息，请参阅[沙盒](#sandboxing)。
  - **默认值：** `false`
  - **示例：** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (字符串):

  - **描述：** 定义用于从项目中发现工具的自定义 shell 命令。shell 命令必须在
    `stdout` 上返回一个
    [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)
    的 JSON 数组。工具包装器是可选的。
  - **默认值：** 空
  - **示例：** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (字符串):

  - **描述：** 定义用于调用使用 `toolDiscoveryCommand` 发现的特定工具的自定义
    shell 命令。shell 命令必须满足以下条件：
    - 它必须将函数
      `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中完全相同）作为第一个命令行参数。
    - 它必须在 `stdin` 上读取函数参数作为 JSON，类似于
      [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 它必须在 `stdout` 上返回函数输出作为 JSON，类似于
      [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** 空
  - **示例：** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (对象):

  - **描述：** 配置与一个或多个模型上下文协议 (MCP)
    服务器的连接，以发现和使用自定义工具。Gemini CLI 尝试连接到每个配置的 MCP
    服务器以发现可用的工具。如果多个 MCP
    服务器公开同名工具，则工具名称将以您在配置中定义的服务器别名为前缀（例如
    `serverAlias__actualToolName`）以避免冲突。请注意，系统可能会从 MCP
    工具定义中剥离某些模式属性以实现兼容性。
  - **默认值：** 空
  - **属性：**
    - **`<SERVER_NAME>`** (对象): 命名服务器的服务器参数。
      - `command` (字符串, 必需): 执行以启动 MCP 服务器的命令。
      - `args` (字符串数组, 可选): 传递给命令的参数。
      - `env` (对象, 可选): 为服务器进程设置的环境变量。
      - `cwd` (字符串, 可选): 启动服务器的工作目录。
      - `timeout` (数字, 可选): 对此 MCP 服务器的请求超时（以毫秒为单位）。
      - `trust` (布尔值, 可选): 信任此服务器并绕过所有工具调用确认。
  - **示例：**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node"
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      },
    }
    ```

- **`checkpointing`** (对象):

  - **描述：**
    配置检查点功能，该功能允许您保存和恢复对话和文件状态。有关更多详细信息，请参阅[检查点文档](../checkpointing.zh.md)。
  - **默认值：** `{"enabled": false}`
  - **属性：**
    - **`enabled`** (布尔值): 当为 `true` 时，`/restore` 命令可用。

- **`preferredEditor`** (字符串):

  - **描述：** 指定用于查看差异的首选编辑器。
  - **默认值：** `vscode`
  - **示例：** `"preferredEditor": "vscode"`

- **`telemetry`** (对象)
  - **描述：** 配置 Gemini CLI
    的日志记录和指标收集。有关更多信息，请参阅[遥测](../telemetry.zh.md)。
  - **默认值：**
    `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **属性：**
    - **`enabled`** (布尔值): 遥测是否启用。
    - **`target`** (字符串): 收集的遥测数据的目标。支持的值为 `local` 和 `gcp`。
    - **`otlpEndpoint`** (字符串): OTLP 导出器的端点。
    - **`logPrompts`** (布尔值): 是否在日志中包含用户提示的内容。
  - **示例：**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```
- **`usageStatisticsEnabled`** (布尔值):
  - **描述：**
    启用或禁用使用情况统计信息的收集。有关更多信息，请参阅[使用情况统计信息](#usage-statistics)。
  - **默认值：** `true`
  - **示例：**
    ```json
    "usageStatisticsEnabled": false
    ```

### 示例 `settings.json`:

```json
{
    "theme": "GitHub",
    "sandbox": "docker",
    "toolDiscoveryCommand": "bin/get_tools",
    "toolCallCommand": "bin/call_tool",
    "mcpServers": {
        "mainServer": {
            "command": "bin/mcp_server.py"
        },
        "anotherServer": {
            "command": "node",
            "args": ["mcp_server.js", "--verbose"]
        }
    },
    "telemetry": {
        "enabled": true,
        "target": "local",
        "otlpEndpoint": "http://localhost:4317",
        "logPrompts": true
    },
    "usageStatisticsEnabled": true
}
```

## Shell 历史记录

CLI 会保留您运行的 shell
命令的历史记录。为避免不同项目之间的冲突，此历史记录存储在用户主文件夹内的特定于项目的目录中。

- **位置：** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是从项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量和 `.env` 文件

环境变量是配置应用程序的常用方法，尤其适用于 API
密钥等敏感信息或可能在不同环境之间更改的设置。

CLI 会自动从 `.env` 文件加载环境变量。加载顺序为：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则在父目录中向上搜索，直到找到 `.env` 文件或到达项目根目录（由
   `.git` 文件夹标识）或主目录。
3. 如果仍未找到，则查找 `~/.env`（在用户的主目录中）。

- **`GEMINI_API_KEY`** (必需):
  - 您的 Gemini API 的 API 密钥。
  - **对操作至关重要。** 如果没有它，CLI 将无法运行。
  - 在您的 shell 配置文件（例如 `~/.bashrc`、`~/.zshrc`）或 `.env`
    文件中设置此项。
- **`GEMINI_MODEL`**:
  - 指定要使用的默认 Gemini 模型。
  - 覆盖硬编码的默认值
  - 示例：`export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`**:
  - 您的 Google Cloud API 密钥。
  - 在快速模式下使用 Vertex AI 时需要。
  - 确保您具有必要的权限并设置了 `GOOGLE_GENAI_USE_VERTEXAI=true` 环境变量。
  - 示例：`export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`。
- **`GOOGLE_CLOUD_PROJECT`**:
  - 您的 Google Cloud 项目 ID。
  - 使用 Code Assist 或 Vertex AI 时需要。
  - 如果使用 Vertex AI，请确保您具有必要的权限并设置
    `GOOGLE_GENAI_USE_VERTEXAI=true` 环境变量。
- **`GOOGLE_CLOUD_LOCATION`**:
  - 您的 Google Cloud 项目的位置（例如 `us-central1`）。
  - 使用 Vertex AI 时需要。
- **`GOOGLE_GENAI_USE_VERTEXAI`**:
  - 设置为 `true` 以使用 Vertex AI 后端。
  - 如果设置，则需要 `GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_CLOUD_LOCATION`。
- **`GEMINI_EMBEDDING_MODEL`**:
  - 指定用于文本嵌入的默认模型。
  - 覆盖硬编码的默认值。
  - 示例：`export GEMINI_EMBEDDING_MODEL="text-embedding-2.5-flash"`
- **`EDITOR`** / **`VISUAL`**:
  - 指定在需要时用于编辑文本的默认文本编辑器。`VISUAL` 优先于 `EDITOR`。
  - 示例：`export VISUAL=vim`
- **`DEBUG`**:
  - 设置为 `true` 可启用详细的调试日志记录。
- **`FORCE_COLOR`**:
  - 当设置为 `1`, `2`, 或 `3`
    时，强制启用彩色输出，即使在检测到不支持颜色的环境中也是如此。数字表示颜色级别（1=16色，2=256色，3=真彩色）。

## 命令行参数

命令行参数是在启动时传递给 Gemini CLI 的标志。它们会覆盖所有其他配置方法。

- **`--prompt, -p`**
  - 在非交互模式下指定要执行的单个提示。
- **`--model`**
  - 指定要使用的 Gemini 模型（例如 `gemini-pro`）。
- **`--embedding-model`**
  - 指定用于嵌入的模型（例如 `text-embedding-004`）。
- **`--edit-file, -e`**
  - 在 REPL 中打开要编辑的文件。
- **`--no-history`**
  - 禁用读取或写入 shell 历史记录。
- **`--no-color`**
  - 禁用彩色输出。
- **`--help`**
  - 显示帮助信息。
- **`--version`**
  - 显示 CLI 版本。
- **`--verbose`**
  - 启用详细日志记录。

### 遥测标志

有关这些标志的更多信息，请参阅[遥测文档](../telemetry.zh.md)。

- **`--telemetry` / `--no-telemetry`**
  - 启用或禁用遥测。
- **`--telemetry-target`**
  - 设置遥测目标（`local` 或 `gcp`）。
- **`--telemetry-log-prompts` / `--no-telemetry-log-prompts`**
  - 在遥测日志中包含或排除提示。
- **`--telemetry-otlp-endpoint`**
  - 指定 OTLP 导出器端点。

### 沙盒标志

有关这些标志的更多信息，请参阅[沙盒文档](../sandbox.zh.md)。

- **`--sandbox, -s`**
  - 启用沙盒。
- **`--docker-image, -i`**
  - 指定要使用的 Docker 镜像。
- **`--mount, -m`**
  - 将其他卷挂载到沙盒中。
- **`--allow-network`**
  - 在沙盒中允许网络访问。
- **`--no-mount-workspace`**
  - 不要将工作区挂载到沙盒中。
- **`--force-in-sandbox, -f`**
  - 强制在沙盒中运行，即使没有检测到工具。
- **`--sandbox-debug`**
  - 启用沙盒调试模式。

### 检查点标志

有关这些标志的更多信息，请参阅[检查点文档](../checkpointing.zh.md)。

- **`--checkpointing`**
  - 启用检查点功能。
- **`--no-checkpointing`**
  - 禁用检查点功能。

## 上下文和内存

### 1. `GEMINI.md` 文件：分层指令上下文

Gemini CLI 使用 `GEMINI.md`
文件来构建分层的指令性上下文。这些文件允许您为不同的目录提供特定的说明、指南或背景信息。

#### 加载顺序

`GEMINI.md` 文件按以下顺序加载和连接：

1. **用户目录:** `~/.gemini/GEMINI.md`
2. **项目根目录:** `project_root/.gemini/GEMINI.md`
3. **父目录:** 从项目根目录向上到主目录
4. **当前工作目录:** `pwd/`
5. **子目录:** `pwd` 下的子目录

#### 默认的 `GEMINI.md`

这是默认的 `GEMINI.md`，它被硬编码到 CLI 中：

```markdown
# Gemini

You are an LLM designed to be a pair programmer. You are running in a CLI inside
a user's terminal.

Your user is a programmer. They will give you tasks to perform.

You have a set of tools that you can use to help you with your tasks.

Your user can see the tools you have available, so do not need to list them
unless the user asks you to.

You can use the `run_shell_command` tool to execute shell commands. This is
useful for exploring the user's project and understanding the context of their
request.

Please provide concise and informative responses. Your user is a programmer, so
you can be technical. If you are not sure about something, please say so.
```

### 2. `/memory` 命令

`/memory` 命令允许您在会话期间动态地与 AI 的内存进行交互。

- **`/memory add <text>`**: 将文本添加到 AI 的临时内存中。
- **`/memory show`**: 显示 AI 当前的完整内存上下文。
- **`/memory refresh`**: 从所有源重新加载 `GEMINI.md` 文件。

### 3. @ 提及

`@<file_path>` 语法可让您将特定文件的内容直接注入到您的提示中。

## 使用情况统计信息

Gemini CLI
收集匿名的使用情况统计信息，以帮助我们改进产品。这包括有关所用命令、性能指标和错误率的信息。

### 选择退出

您可以通过在 `settings.json` 文件中将 `usageStatisticsEnabled` 设置为 `false`
来选择退出此数据收集。

```json
{
    "usageStatisticsEnabled": false
}
```

有关收集的数据和隐私政策的更多详细信息，请参阅[服务条款和隐私声明](../tos-privacy.zh.md)。
