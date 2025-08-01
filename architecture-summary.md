# Gemini CLI 架构设计

本文档根据官方文档综合阐述了 Gemini CLI 的架构设计。

## 1. 高层概述

Gemini CLI 是一个复杂的命令行界面，允许用户与 Google 的 Gemini 模型进行交互。它以客户端-服务器应用的模式运行，清晰地分离了面向用户的界面和后端逻辑。

该架构旨在实现：

*   **模块化:** 将前端（CLI）与后端（Core）分离，允许独立开发和未来扩展。
*   **可扩展:** 强大的工具系统允许添加新功能，包括通过命令发现和模型上下文协议（MCP）服务器添加自定义工具。
*   **安全性:** 沙盒、敏感操作的用户确认机制以及谨慎的 API 密钥管理是设计的核心部分。
*   **以用户为中心:** CLI 提供了丰富的主题、命令历史和会话管理等交互式体验。

## 2. 核心组件

该系统主要由两个主包和一套工具组成。

### 2.1. CLI 包 (`packages/cli`)

这是应用的 **前端**。其主要职责包括：

*   **用户交互:** 管理读取-求值-打印循环（REPL）环境，处理用户输入并渲染输出。
*   **命令解析:** 解析内置的斜杠命令（`/help`, `/theme`）、@命令（`@file`）和 shell 直通命令（`!ls`）。
*   **显示管理:** 主题、UI 渲染以及信息（包括工具调用和模型响应）的视觉呈现。
*   **配置:** 加载和管理面向用户的配置。

### 2.2. Core 包 (`packages/core`)

这是应用的 **后端**。它充当 CLI 和 Gemini API 之间的中介。其关键功能是：

*   **API 交互:** 安全地与 Google Gemini API 通信，包括构建提示和处理响应。
*   **工具编排:**
    *   管理可用工具的注册表。
    *   解析来自 Gemini 模型的工具使用请求。
    *   执行工具（通常需要用户确认）并将结果返回给模型。
*   **状态管理:** 管理对话历史、会话状态和分层指令上下文（来自 `GEMINI.md` 文件）。
*   **安全性:** 处理 API 密钥并管理工具执行的沙盒环境。

### 2.3. 工具 (`packages/core/src/tools/`)

工具是扩展 Gemini 模型能力的模块，使其能够与本地环境交互。关键的内置工具包括：

*   **文件系统:** `list_directory`, `read_file`, `write_file`, `glob`, `search_file_content`, `replace`, `read_many_files`。
*   **执行:** `run_shell_command`。
*   **网络:** `web_fetch`, `google_web_search`。
*   **记忆:** `save_memory`。

## 3. 交互流程

典型的用户交互遵循以下步骤：

1.  **用户���入:** 用户在 `packages/cli` 界面中输入提示。
2.  **请求发送至 Core:** CLI 将输入发送到 `packages/core`。
3.  **提示构建:** Core 包为 Gemini API 构建一个提示，其中包含对话历史、可用的工具定义以及来自 `GEMINI.md` 文件的指令上下文。
4.  **API 请求:** 提示被发送到 Gemini API。
5.  **模型响应:** API 返回一个响应，可能是一个直接的答案或一个使用工具的请求（`FunctionCall`）。
6.  **工具执行 (如果请求):**
    *   Core 包验证工具请求。
    *   对于敏感操作，它通过 CLI 请求用户确认。
    *   确认后，工具被执行，可能在沙盒环境中。
    *   工具的输出（`ToolResult`）被发送回 Gemini API。
7.  **最终响应:** 模型处理工具的输出并生成最终的、面向用户的响应。
8.  **向用户显示:** Core 将最终响应发送到 CLI，由 CLI 格式化并显示。

## 4. 配置与上下文

配置通过分层系统进行管理，命令行参数具有最高优先级。

*   **`settings.json`:** 用户级别（`~/.gemini/settings.json`）和项目级别（`.gemini/settings.json`）的文件用于持久化配置。
*   **环境变量:** 从 `.env` 文件加载，用于敏感数据（如 API 密钥）。
*   **命令行参数:** 覆盖特定会话的其他设置。
*   **`GEMINI.md` (分���上下文):** 这是向模型提供指令上下文的关键功能。这些文件从全局、项目和本地目录分层加载，从而可以对模型在特定项目中的行为和知识进行细粒度控制。

## 5. 安全性与沙盒

安全性是该架构的基本方面。

*   **沙盒:** 潜在不安全的操作在隔离环境中执行。
    *   **macOS:** 使用内置的 `sandbox-exec` (Seatbelt)。
    *   **其他平台:** 使用基于容器的沙盒（Docker 或 Podman）。
*   **用户确认:** 在执行可以修改文件系统或运行 shell 命令的工具之前，CLI 会提示用户批准。
*   **身份验证:** 支持多种身份验证方法，包括 Google 登录（OAuth）和 API 密钥，并为每种方法提供清晰的服务条款和隐私声明。

## 6. 可扩展性

CLI 被设计为可扩展的：

*   **自定义工具:** 用户可以在 `settings.json` 中使用 `toolDiscoveryCommand` 和 `toolCallCommand` 定义自定义工具。
*   **MCP 服务器:** 模型上下文协议（MCP）允许 CLI 连接到公开其自己工具集的外部服务器。这是与外部系统和 API 集成的强大机制。
*   **扩展:** 正式的扩展系统允许将配置、MCP 服务器和上下文文件打包成可重用的扩展。

## 7. 部署与执行

CLI 可以通过多种方式运行：

*   **标准安装:** 作为全局安装的 npm 包（`@google/gemini-cli`）。
*   **`npx`:** 无需安装直接从 npm 注册表执行。
*   **从源码运行:** 用于开发和贡献。
*   **Docker:** 直接从发布的沙盒镜像运行。

发布过程涉及构建和发布 npm 包和 Docker 沙盒镜像。

## 8. 可观测性 (遥测)

CLI 包含一个基于 OpenTelemetry (OTEL) 的遥测系统，用于观察性能、健康状况和使用情况。

*   **收集的数据:** 链路追踪、指标和结构化日志。
*   **目标:** 数据可以发送到本地收集器（用于本地使用 Jaeger 查看）或 Google Cloud。
*   **配置:** 遥测默认禁用，可以通过 `settings.json`、环境变量或 CLI 标志进行配置。
*   **隐私:** 系统提供了记录提示的控制，并根据用户的身份验证方法尊重用户隐私。

该架构使 Gemini CLI 成为一个为开发者设计的强大、灵活且安全的工具，在提供丰富的交互体验的同时，也允许深度定制和扩展。