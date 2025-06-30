# Telemetry System Documentation

This document provides an overview of the telemetry system in the Gemini CLI
application. The system is responsible for collecting and transmitting data
about the application's usage and performance.

## Overall Purpose

The telemetry system is designed to provide insights into how the Gemini CLI is
used, identify performance bottlenecks, and detect errors. It collects two main
types of data:

1. **Structured Logs and Traces**: Detailed records of events that occur within
   the application, such as user prompts, tool calls, and API requests.
2. **Metrics**: Quantitative data about the application's performance, such as
   the latency of tool calls and the number of API errors.

The system is built on top of the OpenTelemetry standard, but also includes a
custom logger for sending usage statistics to Google's Clearcut service.

## Key Components

The telemetry system is composed of several key components, each with a specific
responsibility.

### 1. OpenTelemetry SDK (`packages/core/src/telemetry/sdk.ts`)

- **Purpose**: This is the core of the telemetry system. It is responsible for
  initializing and managing the OpenTelemetry SDK, which provides the framework
  for collecting and exporting telemetry data.
- **Main Functions**:
  - `initializeTelemetry()`: Sets up the SDK, configures exporters (for sending
    data to a collector or the console), and starts the collection process.
  - `shutdownTelemetry()`: Gracefully shuts down the SDK, ensuring that all
    buffered data is sent.
- **Key Principles**:
  - **Configurability**: The SDK can be configured to send data to different
    backends (e.g., a remote collector via OTLP/gRPC or the local console),
    making it suitable for both production and development environments.
  - **Automatic Instrumentation**: It automatically instruments HTTP requests,
    providing traces for them without requiring manual code changes.
  - **Resource Context**: It enriches all telemetry data with information about
    the service (name, version) and the current session, providing valuable
    context for analysis.

### 2. Event Logging (`packages/core/src/telemetry/loggers.ts`)

- **Purpose**: This component is responsible for creating and emitting log
  records for various events that occur within the application.
- **Main Functions**:
  - `logCliConfiguration()`: Logs the initial configuration of the CLI.
  - `logUserPrompt()`: Logs user prompts (with privacy controls).
  - `logToolCall()`: Logs details about tool calls.
  - `logApiRequest()`, `logApiResponse()`, `logApiError()`: Log the lifecycle of
    API requests.
- **Key Principles**:
  - **Integration with OpenTelemetry**: It uses the OpenTelemetry Logs API to
    create and emit logs, which are then processed by the SDK.
  - **Privacy Control**: It includes logic to avoid logging potentially
    sensitive information, such as the content of user prompts, unless
    explicitly enabled by the user.
  - **Dual Logging**: It sends events to both the OpenTelemetry SDK and the
    custom `ClearcutLogger`, suggesting that data is used for different purposes
    (e.g., debugging vs. usage analytics).

### 3. Metrics (`packages/core/src/telemetry/metrics.ts`)

- **Purpose**: This component is responsible for creating and recording
  quantitative metrics about the application's performance and usage.
- **Main Functions**:
  - `initializeMetrics()`: Creates the metric instruments (counters and
    histograms).
  - `recordToolCallMetrics()`: Records the number and latency of tool calls.
  - `recordTokenUsageMetrics()`: Tracks the number of tokens used.
  - `recordApiResponseMetrics()`/`recordApiErrorMetrics()`: Records the number
    and latency of API responses and errors.
- **Key Principles**:
  - **Standard Metric Types**: It uses standard metric types like counters (for
    counting occurrences) and histograms (for measuring distributions like
    latency), which are well-suited for performance analysis.
  - **Rich Attributes**: Metrics are enriched with attributes (e.g., function
    name, success status), allowing for detailed, multi-dimensional analysis.
  - **Separation of Concerns**: The logic for creating metrics is separate from
    the logic for recording them, which leads to cleaner code.

### 4. Clearcut Logger (`packages/core/src/telemetry/clearcut-logger/clearcut-logger.ts`)

- **Purpose**: This is a custom logger designed to send usage statistics to
  Google's Clearcut logging service. It operates independently of the
  OpenTelemetry SDK.
- **Main Functions**:
  - `getInstance()`: Gets a singleton instance of the logger (only if usage
    stats are enabled).
  - `enqueueLogEvent()`: Adds an event to an in-memory queue.
  - `flushToClearcut()`: Sends all queued events to the Clearcut service in
    batches.
- **Key Principles**:
  - **Batching**: Events are queued and sent in batches to reduce network
    overhead.
  - **Opt-in**: The logger is only active if the user has explicitly enabled
    usage statistics, respecting user privacy.
  - **Resilience**: It includes basic error handling to retry sending events if
    the network request fails.
  - **Custom Formatting**: It transforms events into a specific JSON format
    required by the Clearcut API.

### 5. Event Definitions (`packages/core/src/telemetry/types.ts`)

- **Purpose**: This file defines the data structures for all the telemetry
  events that are tracked.
- **Main Event Types**:
  - `StartSessionEvent`, `EndSessionEvent`
  - `UserPromptEvent`
  - `ToolCallEvent`
  - `ApiRequestEvent`, `ApiResponseEvent`, `ApiErrorEvent`
- **Key Principles**:
  - **Strongly Typed**: Using classes for events ensures that the data is
    structured and consistent.
  - **Centralized Definitions**: Having all event definitions in one place makes
    the system easier to understand and maintain.
  - **Data Transformation**: The event classes are responsible for transforming
    data from other parts of the application into the required format for
    telemetry.

### 6. Constants (`packages/core/src/telemetry/constants.ts`)

- **Purpose**: This file defines a set of constant values (e.g., event names,
  metric names) that are used throughout the telemetry system.
- **Key Principles**:
  - **Consistency**: Using constants ensures that the names of events and
    metrics are consistent across the entire system, which is crucial for
    reliable data analysis.
  - **Maintainability**: It makes it easy to update names, as they only need to
    be changed in one place.
