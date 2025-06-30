# `packages/core/src/services` 架构文档

本文档旨在阐明 `packages/core/src/services`
目录中每个服务的用途、主要方法和工作原理。

## 1. FileDiscoveryService

`fileDiscoveryService.ts`

### 用途

`FileDiscoveryService` 用于根据 `.gitignore` 和 `.geminiignore`
文件中的规则来过滤文件路径列表。这在准备要发送给模型的文件上下文时非常有用，可以排除不相关或敏感的文件。

### 主要方法

- **`constructor(projectRoot: string)`**: 初始化服务，加载 `.gitignore` 和
  `.geminiignore` 文件中的忽略规则。
- **`filterFiles(filePaths: string[], options: FilterFilesOptions): string[]`**:
  接收一个文件路径数组，并根据加载的忽略规则返回一个过滤后的数组。`options`
  参数可以控制是否启用 `.gitignore` 和/或 `.geminiignore` 规则。
- **`shouldGitIgnoreFile(filePath: string): boolean`**: 检查单个文件是否应该被
  `.gitignore` 规则忽略。
- **`shouldGeminiIgnoreFile(filePath: string): boolean`**:
  检查单个文件是否应该被 `.geminiignore` 规则忽略。
- **`getGeminiIgnorePatterns(): string[]`**: 返回从 `.geminiignore`
  加载的模式列表。

### 原理

该服务在构造时会解析项目根目录下的 `.gitignore` 和一个名为 `.geminiignore`
的自定义忽略文件。它使用 `GitIgnoreParser` 来加载这些文件中的模式。当调用
`filterFiles`
时，它会遍历提供的文件路径，并应用这些已加载的忽略规则来确定是否应将文件包含在最终列表中。这允许对包含在项目中的文件进行精细控制。

## 2. GitService

`gitService.ts`

### 用途

`GitService` 旨在管理项目的"快照"功能。它通过在后台维护一个"影子"Git
仓库来实现这一点。这个影子仓库允许我们保存和恢复项目文件在特定时间点的状态，而不会干扰用户自己的
Git 工作流程。

### 主要方法

- **`constructor(projectRoot: string)`**: 为给定的项目根目录初始化服务。
- **`initialize(): Promise<void>`**: 设置影子 Git 仓库。如果项目不是一个 Git
  仓库或者 Git 不可用，它会抛出错误。
- **`verifyGitAvailability(): Promise<boolean>`**: 检查系统上是否安装了 Git。
- **`setupShadowGitRepository()`**: 在 `~/.gemini/history/<project_hash>`
  目录下创建一个隐藏的 Git 仓库。它还会创建一个专用的 `.gitconfig`
  以避免与用户的 Git 配置冲突。
- **`getCurrentCommitHash(): Promise<string>`**: 获取影子仓库中当前 HEAD
  的提交哈希。
- **`createFileSnapshot(message: string): Promise<string>`**:
  在影子仓库中创建一个新的提交（快照），包含项目的当前状态。
- **`restoreProjectFromSnapshot(commitHash: string): Promise<void>`**:
  从影子仓库中恢复指定的快照（提交），将项目文件重置为该时间点的状态。

### 原理

`GitService` 的核心思想是利用 Git
的强大功能来创建文件快照，而无需用户进行任何手动操作。它在用户主目录下的一个隐藏位置（`~/.gemini/history/<project_hash>`）为每个项目创建一个独立的（"影子"）Git
仓库。

当 `initialize` 被调用时，它会设置这个影子仓库，包括一个初始提交。当
`createFileSnapshot` 被调用时，它会将当前项目的所有文件（遵循 `.gitignore`
规则）添加到影子仓库的暂存区并创建一个新的提交。`restoreProjectFromSnapshot`
使用 `git restore` 命令将文件恢复到特定提交时的状态，并使用 `git clean`
删除快照后引入的任何新文件。这种方法为实现检查点和恢复功能提供了一个强大而可靠的机制。
