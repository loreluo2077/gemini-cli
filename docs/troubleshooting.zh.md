# 故障排除指南

本指南提供常见问题的解决方案和调试技巧。

## 身份验证

- **错误：`Failed to login. Message: Request contains an invalid argument`**

  - 拥有 Google Workspace 帐户的用户，或拥有与其 Gmail 帐户关联的 Google Cloud
    帐户的用户，可能无法激活 Google Code Assist 计划的免费套餐。
  - 对于 Google Cloud 帐户，您可以通过将 `GOOGLE_CLOUD_PROJECT` 设置为您的项目
    ID 来解决此问题。
  - 您还可以从 [AI Studio](http://aistudio.google.com/app/apikey) 获取 API
    密钥，其中也包含一个单独的免费套餐。

## 常见问题 (FAQ)

- **问：如何将 Gemini CLI 更新到最新版本？**

  - 答：如果通过 npm 全局安装，请使用命令
    `npm install -g @google/gemini-cli@latest` 更新 Gemini
    CLI。如果从源代码运行，请从存储库中拉取最新更改并使用 `npm run build`
    重新构建。

- **问：Gemini CLI 配置文件存储在哪里？**

  - 答：CLI 配置存储在两个 `settings.json`
    文件中：一个在您的主目录中，一个在您项目的根目录中。在这两个位置，`settings.json`
    都位于 `.gemini/` 文件夹中。有关更多详细信息，请参阅
    [CLI 配置](./cli/configuration.zh.md)。

- **问：为什么我在统计信息输出中看不到缓存的令牌计数？**

  - 答：只有在使用缓存的令牌时才会显示缓存的令牌信息。此功能目前适用于 API
    密钥用户（Gemini API 密钥或 Vertex AI），但不适用于 OAuth 用户（Google
    个人/企业帐户），因为 Code Assist API 不支持创建缓存内容。您仍然可以使用
    `/stats` 命令查看您的总令牌使用情况。

## 常见错误消息和解决方案

- **错误：`EADDRINUSE` (地址已在使用) 启动 MCP 服务器时。**

  - **原因：** 另一个进程已在使用 MCP 服务器尝试绑定的端口。
  - **解决方案：** 停止正在使用该端口的其他进程，或将 MCP
    服务器配置为使用不同的端口。

- **错误：找不到命令 (尝试运行 Gemini CLI 时)。**

  - **原因：** Gemini CLI未正确安装或不在您系统的 PATH 中。
  - **解决方案：**
    1. 确保 Gemini CLI 安装成功。
    2. 如果全局安装，请检查您的 npm 全局二进制目录是否在您的 PATH 中。
    3. 如果从源代码运行，请确保您使用正确的命令来调用它（例如，`node packages/cli/dist/index.js ...`）。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**

  - **原因：** 依赖项未正确安装，或项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 以确保所有依赖项都存在。
    2. 运行 `npm run build` 以编译项目。

- **错误："操作不允许"、"权限被拒绝"或类似错误。**

  - **原因：**
    如果启用了沙盒，则应用程序可能正在尝试执行受沙盒限制的操作，例如在项目目录或系统临时目录之外写入。
  - **解决方案：**
    有关更多信息，包括如何自定义沙盒配置，请参阅[沙盒](./cli/configuration.zh.md#sandboxing)。

## 调试技巧

- **CLI 调试：**

  - 对 CLI 命令使用 `--verbose` 标志（如果可用）以获取更详细的输出。
  - 检查 CLI 日志，通常位于特定于用户的配置或缓存目录中。

- **核心调试：**

  - 检查服务器控制台输出中的错误消息或堆栈跟踪。
  - 如果可配置，请增加日志详细程度。
  - 如果需要单步执行服务器端代码，请使用 Node.js
    调试工具（例如，`node --inspect`）。

- **工具问题：**

  - 如果特定工具失败，请尝试通过运行该工具执行的最简单版本的命令或操作来隔离问题。
  - 对于 `run_shell_command`，首先检查该命令是否直接在您的 shell 中起作用。
  - 对于文件系统工具，请仔细检查路径和权限。

- **预检检查：**
  - 在提交代码之前始终运行
    `npm run preflight`。这可以捕获许多与格式化、代码检查和类型错误相关的常见问题。

如果您遇到此处未涵盖的问题，请考虑在 GitHub
上搜索项目的议题跟踪器或报告一个包含详细信息的新议题。
