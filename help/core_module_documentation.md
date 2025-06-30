# Gemini-CLI 核心模块文档

本文档详细介绍了 `packages/core/src/core`
目录下各个文件的用途、主要方法、实现原理和使用示例。

---

## `client.ts`

### 主要用途

`GeminiClient` 类是与 Gemini
模型交互的核心入口。它负责管理聊天会话、历史记录以及与 Gemini API
的通信。该类处理环境上下文的设置、工具注册、向模型发送消息等操作，并包含了聊天记录压缩和模型备用切换等高级逻辑。

### 主要方法

- `constructor(config: Config)`:
  使用配置对象初始化客户端，设置代理（如果提供）和模型名称。
- `initialize(contentGeneratorConfig: ContentGeneratorConfig)`: 异步初始化
  `ContentGenerator` 并通过调用 `startChat` 启动新的聊天会话。
- `addHistory(content: Content)`: 将 `Content` 对象添加到当前聊天的历史记录中。
- `getHistory(): Promise<Content[]>`: 获取当前聊天会话的历史记录。
- `setHistory(history: Content[])`: 用新的历史记录替换当前聊天记录。
- `resetChat()`: 将聊天重置为初始状态。
- `sendMessageStream(request: PartListUnion, signal: AbortSignal, turns: number)`:
  这是向 Gemini 模型发送消息并接收流式响应的核心方法。它处理聊天压缩，运行一个
  `Turn`，并且如果模型指示它应该继续发言，则可以递归调用自身。
- `generateFunctionCall(...)`:
  一个专门的方法，用于根据提供的内容和模式生成函数调用。
- `tryCompressChat(force: boolean)`: 尝试压缩聊天历史记录以保持在令牌限制内。

### 实现原理

`GeminiClient` 对 Gemini API 进行了高级封装，隐藏了管理对话的复杂性：

1. **上下文管理**:
   自动收集用户工作环境的上下文并注入到聊天历史中，为模型提供响应用户项目相关查询的必要信息。
2. **会话管理**: 通过 `GeminiChat` 对象维护对话状态，包括消息历史。
3. **工具使用**: 与 `ToolRegistry`
   集成，为模型提供一组可用的工具，并处理工具调用的执行。
4. **流式交互**: `sendMessageStream`
   方法采用流式处理，支持实时交互。`checkNextSpeaker` 逻辑允许更自然的多轮对话。
5. **弹性设计**: 包含 API 调用的指数退避重试和在出现问题时回退到不同模型的机制。
6. **令牌管理**: 具有压缩聊天历史的机制，以避免超出模型的令牌限制。

### 使用示例 (概念性)

```typescript
// GeminiClient 使用示例

// 1. 配置客户端
const config = new Config({
    apiKey: "YOUR_API_KEY",
    workingDir: "/path/to/project",
});

// 2. 创建并初始化客户端
const client = new GeminiClient(config);
await client.initialize({ apiKey: "YOUR_API_KEY", authType: "apiKey" });

// 3. 发送消息
const userMessage = "请告诉我当前目录中有哪些文件？";
const abortController = new AbortController();

const responseStream = client.sendMessageStream(
    [{ text: userMessage }],
    abortController.signal,
);

// 4. 处理流式响应
for await (const event of responseStream) {
    if (event.type === "text") {
        process.stdout.write(event.value);
    } else if (event.type === "tool-call") {
        // 处理工具调用
    }
}
```

---

## `prompts.ts`

### 主要用途

该文件负责生成发送给 Gemini 模型的主要系统提示（System Prompt）。这个提示为 AI
设定了上下文，将其角色定义为一个软件工程助理，并提供了一套详细的规则和指令，指导其行为方式、可用的工具以及如何使用这些工具。

### 主要方法

- `getCoreSystemPrompt(userMemory?: string): string`:
  这是该模块导出的主要函数。它构建并返回完整的系统提示字符串。该函数还支持从文件（`.gemini/system.md`
  或通过 `GEMINI_SYSTEM_MD` 环境变量指定的自定义路径）加载自定义系统提示。

### 实现原理

该文件背后的核心是"提示工程"（Prompt
Engineering）。系统提示的质量和详细程度对于控制大型语言模型的行为至关重要。

1. **角色扮演**:
   提示首先为模型分配一个特定角色："一个专门从事软件工程任务的交互式 CLI 代理"。
2. **基于规则的指导**: "核心指令"和"操作指南"部分为模型提供了一套严格的规则。
3. **工具感知**: 提示明确列出了可用的工具（例如
   `GrepTool`、`EditTool`）并提供了使用说明。
4. **工作流编排**:
   为常见的高级任务（"软件工程任务"、"新应用程序"）定义了分步工作流程。
5. **上下文适应**:
   提示可以根据环境动态调整，例如检查是否在沙箱中运行，或当前目录是否为 Git
   仓库。
6. **示例驱动学习**: 末尾的 `<example>`
   部分提供了用户与模型交互的具体示例，帮助模型理解预期的行为。

### 使用示例

该文件的输出是一个字符串，即给模型的系统提示。

```text
You are an interactive CLI agent specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.

# Core Mandates
...
```

---

## `tokenLimits.ts`

### 主要用途

该文件定义了各种 Gemini
模型的令牌（Token）限制。每个模型在单个请求中可以处理的令牌数量都有一个上限。这个文件提供了一种根据给定的模型名称查找此限制的方法。

### 主要方法

- `tokenLimit(model: Model): TokenCount`:
  此函数接收一个模型名称（字符串）并返回其对应的令牌限制。如果模型未知，则返回默认值。

### 实现原理

其原理是将模型特定的令牌限制知识集中到一个易于更新的模块中，避免在整个代码库中硬编码这些值，提高了代码的可维护性。

### 使用示例

```typescript
import { tokenLimit } from "./tokenLimits";

const proLimit = tokenLimit("gemini-1.5-pro");
console.log(`gemini-1.5-pro 的令牌限制是 ${proLimit}`);
// 预期输出: gemini-1.5-pro 的令牌限制是 2097152

const flashLimit = tokenLimit("gemini-1.5-flash");
console.log(`gemini-1.5-flash 的令牌限制是 ${flashLimit}`);
// 预期输出: gemini-1.5-flash 的令牌限制是 1048576
```

---

## `turn.ts`

### 主要用途

该文件定义了与 Gemini 模型对话中的
`Turn`（回合）概念。一个"回合"代表一个完整的交互周期：用户发送一条消息，模型进行响应。这个类负责管理这个周期，处理模型的流式响应，并发出结构化的事件。

### 主要组成部分

- **`GeminiEventType` (枚举)**: 定义了在一个回合中可能发生的不同事件类型，如
  `Content`（文本内容）、`ToolCallRequest`（工具调用请求）、`Thought`（思考过程）等。
- **`Turn` 类**:
  - `run(req: PartListUnion, signal: AbortSignal)`: 核心方法，接收用户请求，调用
    `GeminiChat` 的流式接口，并将返回的原始数据流转换成一系列结构化的
    `ServerGeminiStreamEvent` 事件。

### 实现原理

`Turn` 类作为一个**事件驱动的流处理器**。其主要原理是将来自 `GeminiChat`
的原始数据流与需要消费它的应用逻辑解耦。

1. **抽象化**: 它隐藏了解析来自 Gemini API
   的原始响应的复杂性，代之以简单、有意义的事件。
2. **状态管理**: `Turn`
   的一个实例管理着一次完整的用户-模型交换的状态，如累积待处理的工具调用。
3. **结构化事件发射**:
   通过定义一套清晰的事件类型和接口，它为消费代码提供了一种健壮且可预测的方式来处理模型的响应。

### 使用示例 (概念性)

```typescript
// 在 GeminiClient.sendMessageStream 方法内部...

const turn = new Turn(this.getChat());
const eventStream = turn.run(userRequest, abortController.signal);

for await (const event of eventStream) {
    switch (event.type) {
        case GeminiEventType.Thought:
            console.log(`模型正在思考: ${event.value.subject}`);
            break;
        case GeminiEventType.Content:
            process.stdout.write(event.value);
            break;
        case GeminiEventType.ToolCallRequest:
            console.log(`模型想要调用工具: ${event.value.name}`);
            break;
    }
}
```

---

## `contentGenerator.ts`

### 主要用途

该文件充当 `ContentGenerator` 的工厂。`ContentGenerator`
是一个抽象，为与不同底层 AI 模型后端（如 Gemini API, Vertex
AI）进行交互提供了一个统一的接口。

### 主要组成部分

- **`ContentGenerator` (接口)**: 定义了内容生成器必须遵守的契约，包含
  `generateContent`、`generateContentStream` 等方法。
- **`createContentGeneratorConfig(...)` (函数)**:
  负责收集创建内容生成器所需的所有配置，包括从环境变量读取 API 密钥。
- **`createContentGenerator(config: ContentGeneratorConfig)` (函数)**:
  工厂函数，根据配置中的认证类型 (`authType`)，实例化并返回相应的
  `ContentGenerator`。

### 实现原理

核心原理是**工厂模式（Factory Pattern）**与**策略模式（Strategy
Pattern）**的结合。

1. **工厂模式**: `createContentGenerator`
   函数扮演了工厂的角色，客户端无需知道如何构造具体的生成器，只需向工厂请求即可。
2. **策略模式**: `ContentGenerator` 接口定义了一系列与 AI
   通信的策略，不同的实现（如 `GoogleGenAI`
   的实例）是具体的策略。客户端通过通用接口使用，无需关心具体实现。
3. **配置优于编码**:
   程序的行为由配置决定，使得应用程序能灵活地适应不同的部署环境而无需更改代码。

### 使用示例 (概念性)

```typescript
// 在 GeminiClient.initialize 方法内部...

// 1. 创建配置对象.
const contentGeneratorConfig = await createContentGeneratorConfig(this.model, 'gemini-api-key');

// 2. 调用工厂函数获取生成器.
this.contentGenerator = await createContentGenerator(contentGeneratorConfig);

// 3. 客户端通过统一接口使用生成器.
const response = await this.contentGenerator.generateContent({ ... });
```

---

## `coreToolScheduler.ts`

### 主要用途

`CoreToolScheduler` 是一个关键组件，用于管理由 Gemini
模型发起的工具调用的整个生命周期，包括验证、用户批准、执行和结果处理。它充当所有工具相关活动的"控制塔"。

### 主要组成部分

- **`ToolCall` (类型联合)**:
  作为一个状态机，定义了工具调用可能处于的所有状态：`validating`,
  `awaiting_approval`, `scheduled`, `executing`, `success`, `error`,
  `cancelled`。
- **`CoreToolScheduler` 类**:
  - `schedule(request: ToolCallRequestInfo[], signal: AbortSignal)`:
    主要入口点，接收工具调用请求，并启动其生命周期。
  - `handleConfirmationResponse(...)`: 处理用户对批准请求的响应。
  - `attemptExecutionOfScheduledCalls(...)`: 执行所有已就绪的工具调用。

### 实现原理

`CoreToolScheduler` 围绕**状态机**和**事件驱动架构**的原则设计。

1. **状态机**: `ToolCall`
   类型明确定义了所有可能的状态，调度器的逻辑就是根据事件在这些状态之间进行转换。
2. **异步编排**: 调度器通过 `async/await`
   和回调来管理耗时的异步操作，并能并行执行多个独立工具。
3. **解耦和回调**: 调度器通过回调函数 (`onToolCallsUpdate`,
   `onAllToolCallsComplete`) 与外部世界（如 UI）通信，实现了逻辑的解耦。
4. **用户安全和控制**:
   实现了确认流程，在执行潜在危险的工具前等待用户批准，给予用户最终控制权。

### 使用示例 (概念性)

```typescript
// 假设一个 UI 组件正在设置调度器
const scheduler = new CoreToolScheduler({
  toolRegistry: myToolRegistry,
  onToolCallsUpdate: (toolCalls) => {
    // 根据 toolCalls 的状态更新 UI
    updateUiWithToolCallStatus(toolCalls); 
  },
  onAllToolCallsComplete: (completedCalls) => {
    // 将所有工具调用的结果返回给 Gemini 模型
    geminiClient.sendToolResults(completedCalls.map(c => c.response.responseParts));
  },
});

// 模型请求工具调用，客户端调用 schedule()
const toolCallRequest = { callId: '123', name: 'readFile', args: { path: '/etc/passwd' } };
scheduler.schedule([toolCallRequest], abortController.signal);

// UI 显示确认对话框，用户点击 "Yes" 后...
scheduler.handleConfirmationResponse('123', ..., { outcome: 'approved' }, ...);
```

---

## `geminiChat.ts`

### 主要用途

`GeminiChat` 类是一个低级封装器，用于管理与 Gemini
模型的单个会话。其主要职责是维护对话历史，并处理发送消息（包括流式和非流式）的直接
API 调用。

### 主要方法

- `sendMessage(params: SendMessageParameters)`:
  发送单条非流式消息，等待完整响应后返回。
- `sendMessageStream(params: SendMessageParameters)`: 发送流式消息，返回一个
  `AsyncGenerator`，可实时产生响应数据块。
- `getHistory(curated: boolean = false)`:
  返回对话历史，并可以选择返回"整理过的"版本，移除了无效的模型响应。
- `recordHistory(...)`:
  私有方法，用于正确地将用户输入和模型响应追加到内部历史记录中。
- `handleFlashFallback()`: 弹性机制，当主模型不可用时，可以自动切换到
  `gemini-flash` 模型。

### 实现原理

`GeminiChat` 类是一个**有状态的会话管理器**。

1. **历史管理**: 它是对话历史的唯一真实来源。由于 Gemini API
   是无状态的，客户端必须在每次请求时传递完整的历史记录，该类封装了此逻辑。
2. **API 抽象**: 提供了比 `ContentGenerator`
   更高级的接口，调用者只需提供新消息即可。
3. **并发控制**: 使用 `Promise`
   作为简单的互斥锁，确保一次只向模型发送一个请求，防止历史记录顺序错乱。
4. **数据整理和验证**: 内置函数 `extractCuratedHistory`
   可以清理历史记录，确保发送给模型的数据格式正确，增强了系统的鲁棒性。
5. **遥测和日志记录**: 集成了日志功能，用于监控 API 的性能和可靠性。

### 使用示例

该类由 `GeminiClient` 和 `Turn` 内部使用。

```typescript
// 在 Turn.run 内部...
const responseStream = await this.chat.sendMessageStream({
    message: userRequestParts,
    config: { abortSignal: signal },
});

// GeminiChat 实例会自动将用户请求和模型响应记录到历史中
for await (const resp of responseStream) {
    // ...处理响应块...
}
```

---

## `geminiRequest.ts`

### 主要用途

该文件提供了处理 Gemini API 请求数据结构的实用工具，主要是一个辅助函数
`partListUnionToString`，用于将复杂的 `PartListUnion`
类型转换为简单的字符串，便于日志记录和调试。

### 主要方法

- `partListUnionToString(value: PartListUnion): string`: 接收一个
  `PartListUnion` 对象并将其递归地转换为人类可读的字符串。对于复杂的
  `Part`（如文件、函数调用），它会返回一个描述性的占位符。

### 实现原理

1. **类型抽象**: 定义了 `GeminiCodeRequest`
   类型别名，为项目提供了一个更有意义的名称，并便于未来扩展。
2. **数据转换为可用性**: 将复杂的 API
   数据结构转换为简洁的字符串摘要，提高了系统的可调试性和可观察性。

### 使用示例

```typescript
import { partListUnionToString } from "./geminiRequest";

const complexRequest = [
    { text: "请运行函数: " },
    { functionCall: { name: "run_command", args: { command: "ls" } } },
];
console.log(partListUnionToString(complexRequest));
// 输出: 请运行函数: [Function Call: run_command]
```

---

## `logger.ts`

### 主要用途

`Logger`
类负责将会话历史和应用程序状态持久化到本地文件系统，主要用于记录用户消息
(`logs.json`) 和保存/加载会话快照 (`checkpoint.json`)。

### 主要方法

- `initialize()`: 初始化记录器，创建所需目录和文件，并从磁盘加载现有日志。
- `logMessage(type: MessageSenderType, message: string)`:
  将一条新消息以原子方式（读-改-写）追加到 `logs.json`。
- `getPreviousUserMessages()`: 从日志文件中读取并返回所有历史用户消息。
- `saveCheckpoint(conversation: Content[], tag?: string)`:
  将完整的会话历史序列化并保存到检查点文件中。
- `loadCheckpoint(tag?: string)`: 从检查点文件加载会话历史。

### 实现原理

1. **原子性和一致性**:
   采用"读-修改-写"模式来更新日志文件，降低了数据损坏和竞争条件的风险。
2. **弹性**:
   能优雅地处理文件不存在或文件损坏（通过备份并创建新文件）等错误，防止应用崩溃。
3. **状态分离**: 将作为永久记录的用户输入日志 (`logs.json`)
   与可随时覆盖的会话快照 (`checkpoint.json`) 分开存储。
4. **会话管理**: 所有记录都与 `sessionId`
   关联，保证了多会话场景下数据的隔离和正确排序。

### 使用示例

```typescript
const logger = new Logger("session-id-123");
await logger.initialize();

// 记录用户消息
await logger.logMessage(MessageSenderType.USER, "你好");

// 保存会话快照
const history = [ ... ]; // 对话历史
await logger.saveCheckpoint(history);

// 从快照恢复
const restoredHistory = await logger.loadCheckpoint();
```

---

## `modelCheck.ts`

### 主要用途

该文件提供了一个实用函数 `getEffectiveModel`，用于主动检查默认的 "pro"
模型是否因速率限制而不可用。如果检测到速率限制错误（HTTP
429），它会透明地为当前会话切换到一个备用的 "flash" 模型。

### 主要方法

- `getEffectiveModel(apiKey: string, currentConfiguredModel: string): Promise<string>`:
  如果当前配置是
  `gemini-pro`，该函数会发送一个极小的测试请求来探测其可用性。如果收到 429
  错误，则返回 `gemini-flash`
  作为备用模型。在所有其他情况下，返回用户原有的配置。

### 实现原理

核心原理是**优雅降级 (graceful degradation)**。

1. **主动故障检测**:
   在应用启动时进行快速、廉价的检查，而不是等待用户的真实请求失败，从而改善用户体验。
2. **自动回退**:
   当检测到特定的、可恢复的故障（速率限制）时，自动切换到已知可用且限制更宽松的备用模型。
3. **透明度**: 当执行回退时，会向控制台输出一条信息，告知用户模型已被切换。
4. **故障安全**: 检查逻辑本身被包含在 `try...catch`
   块和超时中，即使探测失败，也不会影响应用正常流程，只会返回原始模型。

### 使用示例

该函数通常在应用初始化，创建 `ContentGenerator` 的配置时被调用。

```typescript
// 在 contentGenerator.ts 的 createContentGeneratorConfig 中...

contentGeneratorConfig.model = await getEffectiveModel(
    contentGeneratorConfig.apiKey,
    configuredModel,
);
```

---

## `nonInteractiveToolExecutor.ts`

### 主要用途

该文件提供了一个单一的函数
`executeToolCall`，用于以简单的、非交互的方式执行工具。它是一个"一次性"的执行器，适用于不需要用户确认、实时输出或并发管理的场景。

### 主要方法

- `executeToolCall(config: Config, toolCallRequest: ToolCallRequestInfo, toolRegistry: ToolRegistry, abortSignal?: AbortSignal): Promise<ToolCallResponseInfo>`:
  查找并执行指定的工具，然后将执行结果（或错误）格式化为 Gemini API 所期望的标准
  `ToolCallResponseInfo` 结构。

### 实现原理

1. **单一职责**: 它只负责执行单个工具调用，刻意避免了 `CoreToolScheduler`
   的复杂性。
2. **无状态**: 每次调用都是一个独立的、自包含的操作，不维护任何长期状态。
3. **标准化的输入/输出**: 接收标准的 `ToolCallRequestInfo` 并返回标准的
   `ToolCallResponseInfo`，易于集成。
4. **健壮的错误处理**: `try...catch`
   块确保工具内部的错误不会使调用者崩溃，并将错误统一格式化后返回。

### 使用示例

适用于由应用自身逻辑（而非模型）决定运行工具的场景，例如处理斜杠命令。

```typescript
async function handleSlashCommand(
    command: string,
    args: Record<string, unknown>,
) {
    const toolCallRequest: ToolCallRequestInfo = {
        callId: `client-initiated-${Date.now()}`,
        name: command,
        args: args,
        isClientInitiated: true,
    };

    const config = new Config();
    const toolRegistry = await config.getToolRegistry();

    const response = await executeToolCall(
        config,
        toolCallRequest,
        toolRegistry,
    );

    if (response.error) {
        console.error(`工具执行失败: ${response.resultDisplay}`);
    } else {
        console.log(`工具执行成功: ${response.resultDisplay}`);
    }
}

// 用户输入: /readFile path=README.md
handleSlashCommand("readFile", { path: "README.md" });
```
