# 遥测系统文档

本文档提供了 Gemini CLI 应用程序中遥测系统的概述。该系统负责收集和传输有关应用程序使用情况和性能的数据。

## 总体目的

遥测系统旨在提供有关 Gemini CLI 如何使用的见解，识别性能瓶颈，并检测错误。它收集两种主要类型的数据：

1. **结构化日志和跟踪**：应用程序内发生事件的详细记录，例如用户提示、工具调用和 API 请求。
2. **指标**：有关应用程序性能的定量数据，例如工具调用的延迟和 API 错误的数量。

该系统基于 OpenTelemetry 标准构建，但也包括一个用于向 Google 的 Clearcut 服务发送使用统计信息的自定义记录器。

## 关键组件

遥测系统由几个关键组件组成，每个组件都有特定的职责。

### 1. OpenTelemetry SDK (`packages/core/src/telemetry/sdk.ts`)

- **目的**：这是遥测系统的核心。它负责初始化和管理 OpenTelemetry SDK，该 SDK 提供了收集和导出遥测数据的框架。
- **主要功能**：
  - `initializeTelemetry()`：设置 SDK，配置导出器（用于将数据发送到收集器或控制台），并启动收集过程。
  - `shutdownTelemetry()`：优雅地关闭 SDK，确保所有缓冲的数据都被发送。
- **关键原则**：
  - **可配置性**：SDK 可以配置为将数据发送到不同的后端（例如，通过 OTLP/gRPC 发送到远程收集器或本地控制台），使其适用于生产和开发环境。
  - **自动化工具**：它自动检测 HTTP 请求，为它们提供跟踪，而无需手动更改代码。
  - **资源上下文**：它用有关服务（名称、版本）和当前会话的信息丰富所有遥测数据，为分析提供有价值的上下文。

### 2. 事件日志记录 (`packages/core/src/telemetry/loggers.ts`)

- **目的**：此组件负责为应用程序内发生的各种事件创建和发出日志记录。
- **主要功能**：
  - `logCliConfiguration()`：记录 CLI 的初始配置。
  - `logUserPrompt()`：记录用户提示（具有隐私控制）。
  - `logToolCall()`：记录有关工具调用的详细信息。
  - `logApiRequest()`、`logApiResponse()`、`logApiError()`：记录 API 请求的生命周期。
- **关键原则**：
  - **与 OpenTelemetry 集成**：它使用 OpenTelemetry Logs API 创建和发出日志，然后由 SDK 处理。
  - **隐私控制**：它包括避免记录潜在敏感信息（如用户提示的内容）的逻辑，除非用户明确启用。
  - **双重日志记录**：它将事件发送到 OpenTelemetry SDK 和自定义 `ClearcutLogger`，表明数据用于不同目的（例如，调试与使用分析）。

### 3. 指标 (`packages/core/src/telemetry/metrics.ts`)

- **目的**：此组件负责创建和记录有关应用程序性能和使用情况的定量指标。
- **主要功能**：
  - `initializeMetrics()`：创建指标工具（计数器和直方图）。
  - `recordToolCallMetrics()`：记录工具调用的数量和延迟。
  - `recordTokenUsageMetrics()`：跟踪使用的令牌数量。
  - `recordApiResponseMetrics()`/`recordApiErrorMetrics()`：记录 API 响应和错误的数量和延迟。
- **关键原则**：
  - **标准指标类型**：它使用标准指标类型，如计数器（用于计算出现次数）和直方图（用于测量如延迟的分布），这些非常适合性能分析。
  - **丰富的属性**：指标用属性（例如，函数名称、成功状态）丰富，允许进行详细的多维分析。
  - **关注点分离**：创建指标的逻辑与记录它们的逻辑分开，这导致更清洁的代码。

### 4. Clearcut 记录器 (`packages/core/src/telemetry/clearcut-logger/clearcut-logger.ts`)

- **目的**：这是一个自定义记录器，旨在向 Google 的 Clearcut 日志记录服务发送使用统计信息。它独立于 OpenTelemetry SDK 运行。
- **主要功能**：
  - `getInstance()`：获取记录器的单例实例（仅在启用使用统计信息时）。
  - `enqueueLogEvent()`：将事件添加到内存队列中。
  - `flushToClearcut()`：批量将所有排队的事件发送到 Clearcut 服务。
- **关键原则**：
  - **批处理**：事件被排队并批量发送以减少网络开销。
  - **可选择加入**：只有当用户明确启用使用统计信息时，记录器才处于活动状态，尊重用户隐私。
  - **弹性**：它包括基本的错误处理，如果网络请求失败，会重试发送事件。
  - **自定义格式化**：它将事件转换为 Clearcut API 所需的特定 JSON 格式。

### 5. 事件定义 (`packages/core/src/telemetry/types.ts`)

- **目的**：此文件定义了所有被跟踪的遥测事件的数据结构。
- **主要事件类型**：
  - `StartSessionEvent`、`EndSessionEvent`
  - `UserPromptEvent`
  - `ToolCallEvent`
  - `ApiRequestEvent`、`ApiResponseEvent`、`ApiErrorEvent`
- **关键原则**：
  - **强类型**：使用事件类确保数据结构化且一致。
  - **集中定义**：将所有事件定义放在一个地方使系统更容易理解和维护。
  - **数据转换**：事件类负责将应用程序其他部分的数据转换为遥测所需的格式。

### 6. 常量 (`packages/core/src/telemetry/constants.ts`)

- **目的**：此文件定义了一组在整个遥测系统中使用的常量值（例如，事件名称、指标名称）。
- **关键原则**：
  - **一致性**：使用常量确保事件和指标的名称在整个系统中保持一致，这对于可靠的数据分析至关重要。
  - **可维护性**：它使更新名称变得容易，因为它们只需要在一个地方更改。
