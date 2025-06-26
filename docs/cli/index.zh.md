# Gemini CLI

在 Gemini CLI 中，`packages/cli` 是用户发送和接收带有 Gemini AI
模型及其相关工具的提示的前端。有关 Gemini CLI
的总体概述，请参阅[主文档页面](../index.zh.md)。

## 浏览本节

- **[身份验证](./authentication.zh.md):** 设置 Google AI 服务身份验证的指南。
- **[命令](./commands.zh.md):** Gemini CLI 命令（例如
  `/help`、`/tools`、`/theme`）的参考。
- **[配置](./configuration.zh.md):** 使用配置文件定制 Gemini CLI 行为的指南。
- **[令牌缓存](./token-caching.zh.md):** 通过令牌缓存优化 API 成本。
- **[主题](./themes.zh.md)**: 使用不同主题自定义 CLI 外观的指南。
- **[教程](tutorials.zh.md)**: 演示如何使用 Gemini CLI 自动化开发任务的教程。

## 非交互模式

Gemini CLI
可以在非交互模式下运行，这对于脚本编写和自动化非常有用。在这种模式下，您将输入通过管道传递给
CLI，它执行命令，然后退出。

以下示例将命令从您的终端通过管道传递给 Gemini CLI：

```bash
echo "什么是微调？" | gemini
```

Gemini CLI 执行命令并将输出打印到您的终端。请注意，您可以使用 `--prompt` 或 `-p`
标志实现相同的行为。例如：

```bash
gemini -p "什么是微调？"
```
