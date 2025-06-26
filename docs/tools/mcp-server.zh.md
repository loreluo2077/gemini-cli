# 使用 Gemini CLI 的 MCP 服务器

本文档提供了有关使用 Gemini CLI 配置和使用模型上下文协议 (MCP) 服务器的指南。

## 什么是 MCP 服务器？

MCP 服务器是一个应用程序，它通过模型上下文协议向 Gemini CLI
公开工具和资源，使其能够与外部系统和数据源进行交互。MCP 服务器充当 Gemini
模型与您的本地环境或其他服务（如 API）之间的桥梁。

MCP 服务器使 Gemini CLI 能够：

- **发现工具：** 通过标准化的模式定义列出可用的工具、其描述和参数。
- **执行工具：** 使用定义的参数调用特定工具并接收结构化的响应。
- **访问资源：** 从特定资源读取数据（尽管 Gemini CLI 主要专注于工具执行）。

借助 MCP 服务器，您可以扩展 Gemini CLI
的功能以执行其内置功能之外的操作，例如与数据库、API、自定义脚本或专门的工作流进行交互。

## 核心集成架构

Gemini CLI 通过内置于核心包 (`packages/core/src/tools/`)
中的复杂发现和执行系统与 MCP 服务器集成：

### 发现层 (`mcp-client.ts`)

发现过程由 `discoverMcpTools()` 协调，它：

1. **遍历已配置的服务器** 从您的 `settings.json` `mcpServers` 配置
2. **建立连接** 使用适当的传输机制 (Stdio、SSE 或可流式传输的 HTTP)
3. **获取工具定义** 使用 MCP 协议从每个服务器
4. **清理和验证** 工具模式以与 Gemini API 兼容
5. **在全局工具注册表中注册工具** 并解决冲突

### 执行层 (`mcp-tool.ts`)

每个发现的 MCP 工具都包装在一个 `DiscoveredMCPTool` 实例中，该实例：

- **根据服务器信任设置和用户偏好处理确认逻辑**
- **通过使用适当的参数调用 MCP 服务器来管理工具执行**
- **处理用于 LLM 上下文和用户显示的响应**
- **维护连接状态并处理超时**

### 传输机制

Gemini CLI 支持三种 MCP 传输类型：

- **Stdio 传输：** 生成一个子进程并通过 stdin/stdout 进行通信
- **SSE 传输：** 连接到服务器发送事件端点
- **可流式传输的 HTTP 传输：** 使用 HTTP 流进行通信

## 如何设置您的 MCP 服务器

Gemini CLI 使用 `settings.json` 文件中的 `mcpServers` 配置来定位和连接到 MCP
服务器。此配置支持具有不同传输机制的多个服务器。

### 在 settings.json 中配置 MCP 服务器

您可以在 `~/.gemini/settings.json` 文件的全局级别配置 MCP
服务器，也可以在项目的根目录中创建或打开 `.gemini/settings.json`
文件。在该文件中，添加 `mcpServers` 配置块。

### 配置结构

将一个 `mcpServers` 对象添加到您的 `settings.json` 文件中：

```json
{
    "mcpServers": {
        "serverName": {
            "command": "path/to/server",
            "args": ["--arg1", "value1"],
            "env": {
                "API_KEY": "$MY_API_TOKEN"
            },
            "cwd": "./server-directory",
            "timeout": 30000,
            "trust": false
        }
    }
}
```

### 配置属性

每个服务器配置都支持以下属性：

#### 必需（以下之一）

- **`command`** (字符串): 用于 Stdio 传输的可执行文件路径
- **`url`** (字符串): SSE 端点 URL (例如 `"http://localhost:8080/sse"`)
- **`httpUrl`** (字符串): HTTP 流端点 URL

#### 可选

- **`args`** (字符串[]): 用于 Stdio 传输的命令行参数
- **`env`** (对象): 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或
  `${VAR_NAME}` 语法引用环境变量
- **`cwd`** (字符串): 用于 Stdio 传输的工作目录
- **`timeout`** (数字): 请求超时（以毫秒为单位）（默认值：600,000 毫秒 = 10
  分钟）
- **`trust`** (布尔值): 当为 `true`
  时，绕过此服务器的所有工具调用确认（默认值：`false`）

### 示例配置

#### Python MCP 服务器 (Stdio)

```json
{
    "mcpServers": {
        "pythonTools": {
            "command": "python",
            "args": ["-m", "my_mcp_server", "--port", "8080"],
            "cwd": "./mcp-servers/python",
            "env": {
                "DATABASE_URL": "$DB_CONNECTION_STRING",
                "API_KEY": "${EXTERNAL_API_KEY}"
            },
            "timeout": 15000
        }
    }
}
```

#### Node.js MCP 服务器 (Stdio)

```json
{
    "mcpServers": {
        "nodeServer": {
            "command": "node",
            "args": ["dist/server.js", "--verbose"],
            "cwd": "./mcp-servers/node",
            "trust": true
        }
    }
}
```

#### 基于 Docker 的 MCP 服务器

```json
{
    "mcpServers": {
        "dockerizedServer": {
            "command": "docker",
            "args": [
                "run",
                "-i",
                "--rm",
                "-e",
                "API_KEY",
                "-v",
                "${PWD}:/workspace",
                "my-mcp-server:latest"
            ],
            "env": {
                "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
            }
        }
    }
}
```

#### 基于 HTTP 的 MCP 服务器

```json
{
    "mcpServers": {
        "httpServer": {
            "httpUrl": "http://localhost:3000/mcp",
            "timeout": 5000
        }
    }
}
```

## 发现过程深入探讨

当 Gemini CLI 启动时，它会通过以下详细过程执行 MCP 服务器发现：

### 1. 服务器迭代和连接

对于 `mcpServers` 中配置的每个服务器：

1. **状态跟踪开始：** 服务器状态设置为 `CONNECTING`
2. **传输选择：** 基于配置属性：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **建立连接：** MCP 客户端尝试在配置的超时时间内建立连接
4. **错误处理：** 连接失败被记录下来，服务器状态设置为 `DISCONNECTED`

### 2. 工具发现

成功连接后：

1. **工具列表：** 客户端调用 MCP 服务器的工具列表端点
2. **模式验证：** 验证每个工具的函数声明
3. **名称清理：** 清理工具名称以满足 Gemini API 要求：
   - 无效字符（非字母数字、下划线、点、连字符）替换为下划线
   - 超过 63 个字符的名称被截断并用中间替换 (`___`)

### 3. 冲突解决

当多个服务器公开同名工具时：

1. **首次注册获胜：** 第一个注册工具名称的服务器获得未加前缀的名称
2. **自动加前缀：** 后续服务器获得加前缀的名称：`serverName__toolName`
3. **注册表跟踪：** 工具注册表维护服务器名称与其工具之间的映射

### 4. 模式处理

工具参数模式会经过清理以与 Gemini API 兼容：

- **`$schema` 属性** 被移除
- **`additionalProperties`** 被剥离
- **带有 `default` 的 `anyOf`** 的默认值被移除（Vertex AI 兼容性）
- **递归处理** 适用于嵌套模式

### 5. 连接管理

发现后：

- **持久连接：** 成功注册工具的服务器保持其连接
- **清理：** 未提供可用工具的服务器的连接被关闭
- **状态更新：** 最终服务器状态设置为 `CONNECTED` 或 `DISCONNECTED`

## 工具执行流程

当 Gemini 模型决定使用 MCP 工具时，会发生以下执行流程：

### 1. 工具调用

模型生成一个 `FunctionCall`，其中包含：

- **工具名称：** 注册的名称（可能带前缀）
- **参数：** 与工具参数模式匹配的 JSON 对象

### 2. 确认过程

每个 `DiscoveredMCPTool` 都实现了复杂的确认逻辑：

#### 基于信任的绕过

```typescript
if (this.trust) {
    return false; // 不需要确认
}
```

#### 动态允许列表

系统维护内部允许列表：

- **服务器级别：** `serverName` → 来自此服务器的所有工具都受信任
- **工具级别：** `serverName.toolName` → 此特定工具受信任

#### 用户选择处理
