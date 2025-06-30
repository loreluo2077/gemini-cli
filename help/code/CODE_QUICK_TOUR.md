# Gemini CLI - 代码快速导览

本文档为您提供一个快速导览，帮助您理解 `gemini-cli`
项目的核心代码结构和主要逻辑。

## 核心架构

项目主要分为两个模块，均位于 `packages/` 目录下：

- `packages/core`:
  **核心逻辑库**。它不是一个独立的服务器，而是一个提供核心功能的库，负责处理与
  Google Gemini API 的通信、管理和执行工具等。
- `packages/cli`: **命令行界面 (客户端)**。它是一个基于 React (Ink)
  的应用程序，为用户提供交互式的命令行体验。它直接引用 `packages/core`
  库来执行操作。
- **外部工具服务**: 某些高级功能，如 `mcp-server`，是通过外部依赖（如
  `@modelcontextprotocol/sdk`）实现的，而不是在本项目中直接编码。

---

## 建议的阅读路径

为了高效地理解整个项目的工作流程，建议您遵循以下阅读顺序：

1. **核心库入口**: `packages/core/src/index.ts` - 查看 `core` 库导出了哪些模块。
2. **Gemini 客户端**: `packages/core/src/core/client.ts` -
   理解核心业务流程的编排。
3. **与 Gemini API 交互**: `packages/core/src/core/geminiChat.ts` - 查看与
   Gemini API 交互的具体实现。
4. **工具系统**: `packages/core/src/tools/tool-registry.ts` 和
   `packages/core/src/core/coreToolScheduler.ts` -
   了解工具是如何注册、管理和执行的。
5. **客户端交互界面**: `packages/cli/src/gemini.tsx` - 探索客户端如何与用户以及
   `core` 库进行交互。

---

## 关键文件详解

### `packages/core` (核心逻辑库)

#### 1. 库入口

- **`packages/core/src/index.ts`**: `core`
  库的入口文件，从此可以追踪所有被导出的核心功能。

#### 2. 核心客户端与聊天逻辑

- **`packages/core/src/core/client.ts`**:
  核心客户端，负责初始化和管理整个聊天会话的生命周期。
- **`packages/core/src/core/geminiChat.ts`**: 封装了与 Google Gemini API
  的所有通信逻辑，是与模型交互的核心。

#### 3. 工具管理

- **`packages/core/src/tools/tool-registry.ts`**: 负责加载和注册所有可用工具。
- **`packages/core/src/core/coreToolScheduler.ts`**:
  在与模型交互期间，调度和执行工具。

#### 4. 工具定义

- **`packages/core/src/tools/`**:
  该目录包含了所有内置工具（如文件系统、shell、Web 搜索等）的具体实现。

### `packages/cli` (命令行界面)

#### 1. 交互式主程序

- **`packages/cli/src/gemini.tsx`**: CLI 的核心文件，使用 React 和 Ink
  库构建。它负责：
  - 渲染用户界面 (REPL)。
  - 处理用户输入。
  - 调用 `core` 服务的 API。
  - 将结果呈现给用户。

#### 2. 非交互式模式

- **`packages/cli/src/nonInteractiveCli.ts`**:
  处理非交互式命令的执行逻辑（例如，通过管道传递数据或直接执行单个命令）。

#### 3. UI 组件与配置

- **`packages/cli/src/ui/`**: 存放所有用于构建界面的 React 组件。
- **`packages/cli/src/config/`**: 负责加载和管理 CLI 的客户端配置。
