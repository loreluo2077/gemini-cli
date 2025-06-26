# Gemini CLI 执行和部署

本文档介绍如何运行 Gemini CLI，并说明 Gemini CLI 使用的部署架构。

## 运行 Gemini CLI

有几种方法可以运行 Gemini CLI。您选择的选项取决于您打算如何使用 Gemini CLI。

---

### 1. 标准安装（推荐给普通用户）

这是最终用户安装 Gemini CLI 的推荐方法。它涉及从 NPM 注册表下载 Gemini CLI 包。

- **全局安装:**

  ```bash
  # 全局安装 CLI
  npm install -g @google/gemini-cli

  # 现在您可以从任何地方运行 CLI
  gemini
  ```

- **NPX 执行:**
  ```bash
  # 无需全局安装即可从 NPM 执行最新版本
  npx @google/gemini-cli
  ```

---

### 2. 在沙箱中运行 (Docker/Podman)

为了安全和隔离，Gemini CLI 可以在容器内运行。这是 CLI
执行可能有副作用的工具的默认方式。

- **直接从注册表运行:** 您可以直接运行已发布的沙箱镜像。这对于您只有 Docker
  并希望运行 CLI 的环境很有用。
  ```bash
  # 运行已发布的沙箱镜像
  docker run --rm -it us-docker.pkg.dev/gemini-code-dev/gemini-cli/sandbox:0.1.1
  ```
- **使用 `--sandbox` 标志:** 如果您在本地安装了 Gemini
  CLI（使用上述标准安装），您可以指示它在沙箱容器内运行。
  ```bash
  gemini --sandbox "你的提示语"
  ```

---

### 3. 从源代码运行（推荐给 Gemini CLI 贡献者）

项目贡献者会希望直接从源代码运行 CLI。

- **开发模式:** 此方法提供热重载，对活跃的开发很有用。
  ```bash
  # 从仓库的根目录
  npm run start
  ```
- **类生产模式 (链接包):**
  此方法通过链接您的本地包来模拟全局安装。它对于在生产工作流中测试本地构建很有用。

  ```bash
  # 将本地 cli 包链接到您的全局 node_modules
  npm link packages/cli

  # 现在您可以使用 `gemini` 命令运行您的本地版本
  gemini
  ```

---

### 4. 从 GitHub 运行最新的 Gemini CLI 提交

您可以直接从 GitHub 仓库运行最新提交的 Gemini CLI
版本。这对于测试仍在开发中的功能很有用。

```bash
# 直接从 GitHub 上的 main 分支执行 CLI
npx https://github.com/google-gemini/gemini-cli
```

## 部署架构

上述执行方法是通过以下架构组件和流程实现的：

**NPM 包**

Gemini CLI 项目是一个 monorepo，它向 NPM 注册表发布两个核心包：

- `@google/gemini-cli-core`: 后端，处理逻辑和工具执行。
- `@google/gemini-cli`:面向用户的​​前端。

这些包在执行标准安装和从源代码运行 Gemini CLI 时使用。

**构建和打包流程**

根据分发渠道的不同，使用两种不同的构建流程：

- **NPM 发布:** 为了发布到 NPM 注册表，`@google/gemini-cli-core` 和
  `@google/gemini-cli` 中的 TypeScript 源代码使用 TypeScript 编译器 (`tsc`)
  转译为标准 JavaScript。生成的 `dist/` 目录是 NPM 包中发布的内容。这是
  TypeScript 库的标准方法。

- **GitHub `npx` 执行:** 当直接从 GitHub 运行最新版本的 Gemini CLI
  时，`package.json` 中的 `prepare` 脚本会触发一个不同的流程。该脚本使用
  `esbuild` 将整个应用程序及其依赖项捆绑到一个独立的 JavaScript
  文件中。该捆绑包在用户机器上动态创建，不会检入仓库。

**Docker 沙箱镜像**

基于 Docker 的执行方法由 `gemini-cli-sandbox`
容器镜像支持。该镜像发布到容器注册表，并包含一个预安装的全局版本的 Gemini
CLI。`scripts/prepare-cli-packagejson.js` 脚本在发布前将此镜像的 URI 动态注入到
CLI 的 `package.json` 中，以便 CLI 在使用 `--sandbox` 标志时知道要拉取哪个镜像。

## 发布流程

一个统一的脚本 `npm run publish:release` 协调发布过程。该脚本执行以下操作：

1. 使用 `tsc` 构建 NPM 包。
2. 使用 Docker 镜像 URI 更新 CLI 的 `package.json`。
3. 构建并标记 `gemini-cli-sandbox` Docker 镜像。
4. 将 Docker 镜像推送到容器注册表。
5. 将 NPM 包发布到工件注册表。
