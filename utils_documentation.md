# `packages/core/src/utils` 文档

本文档概述了 `packages/core/src/utils` 目录下的各种工具。

---

### `retry.ts`

- **用途:**
  提供一种机制，用于在出现暂时性错误（如网络问题或速率限制）时，以指数退避和抖动策略重试异步函数。
- **主要方法/类:** `retryWithBackoff<T>(fn, options)`
- **原理:** 该函数会重复调用指定的异步函数 `fn`，直到成功或达到
  `maxAttempts`（最大尝试次数）上限。每次重试之间，它会等待一段计算好的延迟时间。该延迟从
  `initialDelayMs` 开始，每次失败后翻倍（指数退避），直至达到
  `maxDelayMs`。同时，它会加入一个随机的"抖动"时间，以防止多个客户端同步重试。它对
  HTTP 429（请求过多）错误有特殊处理逻辑，包括遵循 `Retry-After` 响应头。

---

### `schemaValidator.ts`

- **用途:** 一个用于根据 JSON Schema 验证 JavaScript 对象的简单工具。
- **主要方法/类:** `SchemaValidator.validate(schema, data)`
- **原理:** 它执行基本的验证检查。首先，它会验证 schema 中所有标记为 `required`
  的字段是否存在于数据对象中。其次，它会检查数据对象中各属性的类型是否与 schema
  的 `properties` 中定义的 `type`
  相匹配。这是一个简化版的实现，在实际应用中，建议使用如 `Ajv` 等更强大的库。

---

### `user_id.ts`

- **用途:** 管理一个持久化的、跨工具会话的唯一用户 ID。
- **主要方法/类:** `getPersistentUserId()`
- **原理:** 此工具会检查 `~/.gemini/user_id` 文件中是否存在用户
  ID。如果该目录或文件不存在，它会自动创建。如果文件中没有 ID，它会生成一个新的
  `randomUUID`，将其写入文件以备后用，然后返回该
  ID。这确保了在多次运行应用时能识别同一用户。它还包含了错误处理机制，在文件系统访问失败时会生成一个临时的
  ID。

---

### `getFolderStructure.ts`

- **用途:** 生成一个类似于 `tree`
  命令输出的目录结构字符串，并提供多种自定义选项。
- **主要方法/类:** `getFolderStructure(directory, options)`
- **原理:** 该工具从指定的 `rootPath` 开始，执行广度优先搜索
  (BFS)。它会读取目录内容，并根据
  `ignoredFolders`（忽略的文件夹）、`fileIncludePattern`（文件包含模式）以及
  `.gitignore` 规则（如果 `respectGitIgnore` 为
  true）来过滤文件和文件夹。为了防止输出过大，它会限制
  `maxItems`（最大项目数）。在构建了一个树状数据结构 (`FullFolderInfo`)
  后，它会将此结构格式化为一个带缩进的字符串。

---

### `gitIgnoreParser.ts`

- **用途:** 解析 `.gitignore` 文件，并判断给定的文件路径是否应被忽略。
- **主要方法/类:** `GitIgnoreParser` 类, `isIgnored(filePath)` 方法。
- **原理:** 该工具底层使用了 `ignore`
  库。在初始化时，它会接收一个项目根目录，并自动加载该仓库下的 `.gitignore` 和
  `.git/info/exclude` 文件中的所有忽略规则。`isIgnored`
  方法会将输入的文件路径与这些规则进行匹配，以确定该文件是否应被忽略。为了精确匹配，它会先将路径转换为相对于项目根目录的相对路径。

---

### `gitUtils.ts`

- **用途:** 提供与 Git 仓库相关的实用工具函数。
- **主要方法/类:** `isGitRepository(directory)`, `findGitRoot(directory)`
- **原理:** `isGitRepository` 和 `findGitRoot`
  都通过从指定目录开始向上遍历文件系统来工作。在每一级目录中，它们会检查是否存在一个名为
  `.git` 的文件或目录。如果找到了，`isGitRepository` 返回 `true`，而
  `findGitRoot` 返回包含 `.git`
  的目录路径。如果遍历到文件系统根目录仍未找到，则分别返回 `false` 或 `null`。

---

### `memoryDiscovery.ts`

- **用途:** 发现并加载层次化的配置/记忆文件（通常命名为 `.gemini.md` 或
  `gemini.md`）。
- **主要方法/类:** `loadServerHierarchicalMemory(...)`
- **原理:** 它按照特定的优先级顺序搜索名为 `gemini.md`
  的特殊文件。搜索顺序如下：首先是用户的全局配置目录
  (`~/.gemini/`)；然后是从当前工作目录向上遍历至项目根目录；最后是从当前目录向下进行广度优先搜索。这种分层方法允许用户定义全局、项目级和局部的配置。所有找到的文件的内容最终会被连接在一起，形成完整的"记忆"。

---

### `messageInspectors.ts`

- **用途:** 包含用于检查 Gemini `Content` 对象属性的函数。
- **主要方法/类:** `isFunctionResponse(content)`
- **原理:** 该函数用于判断一个给定的 `Content`
  对象是否代表一个函数调用的返回结果。它通过验证对象的 `role` 是否为
  `'user'`，并且其 `parts` 数组中的每个元素都包含 `functionResponse`
  属性来实现。

---

### `nextSpeakerChecker.ts`

- **用途:** 判断在对话中，下一步应该由"用户"还是"模型"发言。
- **主要方法/类:** `checkNextSpeaker(chat, geminiClient, abortSignal)`
- **原理:**
  此工具结合了规则和语言模型判断。它首先处理简单情况：如果最后一条消息是函数响应，则应由模型继续发言。如果不是，它会构建一个特殊的提示
  (`CHECK_PROMPT`)，让语言模型分析它自己的上一条回复，并根据一系列规则（例如，是否提出了问题、内容是否不完整）来决定谁应该接话。它使用这个提示和一个特定的
  JSON Schema 来调用 Gemini API，以获取一个结构化的决策，如
  `{ "next_speaker": "user", "reasoning": "..." }`。

---

### `paths.ts`

- **用途:** 提供一系列用于处理和格式化文件路径的实用函数。
- **主要方法/类:** `tildeifyPath`, `shortenPath`, `makeRelative`, `escapePath`,
  `unescapePath`, `getProjectHash`, `getProjectTempDir`
- **原理:** 这些是直接的路径处理函数。`tildeifyPath` 将主目录路径替换为
  `~`。`shortenPath` 将过长路径的中间部分替换为 `...`。`makeRelative`
  计算相对路径。`escape/unescapePath` 处理路径中的空格。`getProjectHash`
  从项目路径生成一个 SHA256 哈希，`getProjectTempDir` 则使用此哈希在
  `~/.gemini/tmp` 目录下为该项目创建一个唯一的临时目录。

---

### `editCorrector.ts`

- **用途:**
  修正文件编辑工具的参数，特别是处理由语言模型引起的字符串转义问题或轻微不匹配。
- **主要方法/类:** `ensureCorrectEdit(...)`, `ensureCorrectFileContent(...)`
- **原理:** 这是一个复杂的自修正层。当一个 `edit` 命令因为找不到 `old_string`
  而失败时，`ensureCorrectEdit` 会尝试修复它。首先，它会尝试反转义常见模式（如
  `\"` 到 `"`）。如果失败，它会利用 Gemini 模型本身在实际文件内容中查找与
  `old_string` "最接近"的匹配项。它还有逻辑来修正
  `new_string`，以确保最终的编辑符合预期。该工具使用缓存来避免重复的修正计算。

---

### `editor.ts`

- **用途:** 调用用户偏好的代码编辑器来显示两个文件之间的差异 (diff)。
- **主要方法/类:** `openDiff(oldPath, newPath, editor)`
- **原理:** 该工具维护了一个支持的编辑器列表（如 `vscode`,
  `vim`）以及启动它们进入 diff 模式所需的命令行参数。`isEditorAvailable`
  用于检查用户配置的编辑器是否已在系统中安装。`openDiff`
  则根据编辑器类型构建相应的命令，并使用 Node.js 的 `spawn`（用于 GUI 编辑器）或
  `execSync`（用于终端编辑器）来打开 diff 视图。

---

### `errorReporting.ts`

- **用途:** 生成详细的错误报告，并将其保存到文件中以便于调试。
- **主要方法/类:** `reportError(error, baseMessage, context, type)`
- **原理:**
  当程序发生错误时，此函数会创建一个包含错误消息、堆栈跟踪以及相关上下文（如聊天记录）的
  JSON 对象。然后，它将这个 JSON 数据写入操作系统临时目录（如
  `/tmp`）下的一个带时间戳的文件中，并在控制台打印消息，告知用户完整错误报告的路径。

---

### `errors.ts`

- **用途:** 定义自定义错误类并提供错误处理的辅助函数。
- **主要方法/类:** `isNodeError`, `getErrorMessage`, `toFriendlyError`,
  `ForbiddenError`, `UnauthorizedError`, `BadRequestError`
- **原理:** 它提供了类型守卫 (`isNodeError`)
  和自定义错误类，以便更好地对错误进行分类。核心函数是
  `toFriendlyError`，它会检查一个错误（特别是来自 Google API 调用的
  `GaxiosError`），并将其转换为更具体、用户友好的错误类型。例如，它会将一个通用的
  HTTP 403 错误转换为一个带有清晰说明（从 API 响应中提取）的 `ForbiddenError`。

---

### `fetch.ts`

- **用途:** 一个对原生 `fetch` 的简单封装，增加了超时和私有 IP 地址检查功能。
- **主要方法/类:** `fetchWithTimeout(url, timeout)`
- **原理:** `fetchWithTimeout` 利用了 `AbortController`。它启动一个
  `setTimeout`，在超时后调用 `controller.abort()`。这个中止信号被传递给底层的
  `fetch` 调用，从而在达到超时时间后中断请求。`isPrivateIp`
  使用一组正则表达式来检查 URL 的主机名是否解析为本地或私有网络地址。

---

### `fileUtils.ts`

- **用途:** 提供一套全面的文件读取、处理和分类的工具。
- **主要方法/类:** `detectFileType`, `processSingleFileContent`
- **原理:** `detectFileType` 结合使用文件扩展名（通过 `mime-types`
  库）和内容分析来判断文件是文本、图像、PDF 还是通用二进制文件。`isBinaryFile`
  会读取文件的前几千字节，并检查是否存在高比例的不可打印字符或空字节。`processSingleFileContent`
  是核心函数，它调用 `detectFileType`
  后相应地读取文件，能够截断大型文本文件，并为语言模型和用户界面返回结构化的处理结果。

---

### `generateContentResponseUtilities.ts`

- **用途:** 从 Gemini API 返回的 `GenerateContentResponse`
  对象中提取特定信息，如文本或函数调用。
- **主要方法/类:** `getResponseText`, `getFunctionCalls`,
  `getStructuredResponse`
- **原理:** 这些是简单的访问器函数。它们通过遍历 `GenerateContentResponse`
  对象的嵌套结构（特别是 `response.candidates[0].content.parts`
  数组）来提取所需数据，过滤并连接文本内容或收集函数调用对象。

---

### `LruCache.ts`

- **用途:** 实现一个简单的最近最少使用 (LRU) 缓存。
- **主要方法/类:** `LruCache` 类, 包含 `get`, `set`, `clear` 方法。
- **原理:** 它使用 JavaScript 的 `Map` 对象来存储键值对。当通过 `get`
  访问一个项目时，该项目会被删除并重新插入到 Map
  中，这会将其移动到插入顺序的末尾，从而标记为最近使用的项。当通过 `set`
  添加新项且缓存已满时，位于插入顺序最前端（即最久未使用的）的项目将被删除，以便为新项腾出空间。

---

### `bfsFileSearch.ts`

- **用途:** 在文件系统中执行广度优先搜索 (BFS) 来查找特定文件。
- **主要方法/类:** `bfsFileSearch(rootDir, options)`
- **原理:** 它使用一个队列数据结构，初始时包含根目录
  `rootDir`。它逐一处理队列中的目录，并将其子目录添加到队列末尾，从而确保在深入下一层级之前，完全探索当前层级的所有目录。它会记录已访问的目录以避免由符号链接引起的无限循环。可以配置该搜索以忽略特定目录、遵守
  `.gitignore` 规则，并限制扫描的目录总数。
