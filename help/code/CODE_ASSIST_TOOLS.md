# Code Assist 工具文档

本文档概述了 `packages/core/src/code_assist` 目录中可用的各种工具。

---

## `codeAssist.ts`

- **用途 (Purpose):**
  作为代码辅助功能的工厂和主入口点。它的主要职责是根据提供的身份验证类型配置和实例化一个内容生成器
  (`ContentGenerator`)。

- **主要方法 (Main Methods):**
  - `createCodeAssistContentGenerator(httpOptions: HttpOptions, authType: AuthType): Promise<ContentGenerator>`:
    根据指定的 `authType` (目前仅支持 `AuthType.LOGIN_WITH_GOOGLE_PERSONAL`)
    创建并返回一个 `CodeAssistServer` 实例。

- **原理 (How it works):**
  此函数是一个工厂。当被调用时，它会检查身份验证类型。如果支持该类型，它会通过
  `oauth2.ts` 模块获取一个 OAuth2 客户端，然后调用 `setup.ts` 中的 `setupUser`
  函数来配置用户的 Google Cloud 项目 ID。最后，它用获取到的凭证和项目 ID
  实例化并返回一个新的 `CodeAssistServer`，该服务器已准备好与后端 API 进行通信。

---

## `converter.ts`

- **用途 (Purpose):** 在 `@google/genai` 库使用的数据结构和 Google Cloud (Vertex
  AI) 后端 API 预期的格式之间充当数据转换层。

- **主要方法 (Main Methods):**
  - `toGenerateContentRequest(...)`: 将 `@google/genai` 的内容生成请求转换为
    Vertex AI 格式。
  - `fromGenerateContentResponse(...)`: 将 Vertex AI 的内容生成响应转换回
    `@google/genai` 格式。
  - `toCountTokenRequest(...)`: 将 `@google/genai` 的令牌计数请求转换为 Vertex
    AI 格式。
  - `fromCountTokenResponse(...)`: 将 Vertex AI 的令牌计数响应转换回
    `@google/genai` 格式。

- **原理 (How it works):** 该文件定义了一组与 Vertex AI 后端 JSON 结构相匹配的
  TypeScript 接口。它导出了一系列 `to...` 和 `from...` 函数。`to...` 函数接受
  `@google/genai` 库的对象作为输入，并将其字段映射到一个新的对象，该对象符合
  Vertex AI 的接口。`from...`
  函数则执行相反的操作，确保应用程序的其余部分可以与标准的 `@google/genai`
  库进行交互，而无需了解底层的 API 细节。

---

## `oauth2.ts`

- **用途 (Purpose):** 管理通过 Google 进行的 OAuth2
  用户身份验证。它处理获取、缓存和刷新访问令牌的所有方面。

- **主要方法 (Main Methods):**
  - `getOauthClient(): Promise<OAuth2Client>`: 获取一个经过完全身份验证的
    `OAuth2Client` 实例。这是该模块的主要导出函数。
  - `clearCachedCredentialFile()`: 删除本地缓存的凭证文件，有效地让用户登出。

- **原理 (How it works):** 当 `getOauthClient`
  被调用时，它首先尝试从本地文件系统 (`~/.gemini/oauth_creds.json`)
  加载一个缓存的令牌。如果找到了一个有效的、未被撤销的令牌，它就返回一个用该令牌初始化的客户端。如果没有找到，它会启动一个基于
  Web 的授权流程：
  1. 在本地一个可用端口上启动一个临时的 HTTP 服务器。
  2. 生成一个指向 Google 登录页面的特殊 URL，并将 `redirect_uri`
     设置为本地服务器的地址。
  3. 在用户的浏览器中打开此 URL。
  4. 用户授权后，Google 会将浏览器重定向回本地服务器，并在 URL
     中附带一个授权码。
  5. 本地服务器捕获该授权码，用它来换取访问令牌和刷新令牌。
  6. 这些凭证被缓存到本地文件系统，然后服务器关闭。

---

## `server.ts`

- **用途 (Purpose):** 实现 `ContentGenerator` 接口，并处理与 Google Cloud Code
  Assist 后端 API 的所有通信。

- **主要方法 (Main Methods):**
  - `generateContent(...)`: 发送单个请求并等待完整响应以生成内容。
  - `generateContentStream(...)`: 通过服务器发送事件 (SSE)
    以流式方式生成内容，允许逐步接收响应。
  - `countTokens(...)`: 调用 API 以计算给定输入的令牌数量。
  - `onboardUser(...)`: 调用用户引导流程的端点。
  - `loadCodeAssist(...)`: 调用 API 以加载用户的配置和状态。

- **原理 (How it works):** `CodeAssistServer` 类使用来自 `google-auth-library`
  的 `AuthClient` 来向 Code Assist 后端 (`https://cloudcode-pa.googleapis.com`)
  发出经过身份验证的 HTTP 请求。
  - 对于标准请求 (`callEndpoint`)，它会发送一个 POST 请求并等待 JSON 响应。
  - 对于流式请求 (`streamEndpoint`)，它会发送一个带有 `alt=sse` 查询参数的 POST
    请求。然后它会监听响应流，逐行读取，并将以 `data:` 开头的行解析为单独的 JSON
    对象，在收到每个对象时将其 `yield` 出来。 在向 API 发送请求之前，它使用
    `converter.ts`
    中的函数将请求对象转换为正确的格式，并在收到响应后将其转换回来。

---

## `setup.ts`

- **用途 (Purpose):** 处理新用户的初始设置和引导流程。它确保用户与一个 Google
  Cloud 项目相关联，并被配置为正确的服务层级。

- **主要方法 (Main Methods):**
  - `setupUser(authClient: OAuth2Client): Promise<string>`:
    执行用户设置，并返回最终确定的 Google Cloud 项目 ID。

- **原理 (How it works):** 此模块协调了用户设置的多个步骤：
  1. 它首先检查 `GOOGLE_CLOUD_PROJECT` 环境变量。
  2. 它调用 `server.ts` 中的 `loadCodeAssist` API
     来获取有关用户当前状态的信息，包括他们允许的服务层级 (`allowedTiers`)。
  3. 它根据 `loadCodeAssist`
     的响应来确定要为用户设置的正确层级（通常是默认层级）。
  4. 如果所选层级需要一个项目 ID，但没有提供，它会抛出一个错误。
  5. 然后它调用 `onboardUser` API。由于这是一个长时间运行的操作
     (LRO)，它会定期轮询该端点（每5秒），直到操作完成。
  6. 一旦引导完成，它会从最终的响应中提取并返回项目 ID。
