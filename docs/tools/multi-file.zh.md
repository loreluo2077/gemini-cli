# 多文件读取工具 (`read_many_files`)

本文档介绍 Gemini CLI 的 `read_many_files` 工具。

## 描述

使用 `read_many_files` 从通过路径或 glob
模式指定的多个文件中读取内容。此工具的行为取决于所提供的文件：

- 对于文本文件，此工具会将其内容连接成单个字符串。
- 对于图像（例如 PNG、JPEG）和 PDF
  文件，如果通过名称或扩展名明确请求，它会读取它们并将其作为 base64
  编码的数据返回。

`read_many_files`
可用于执行诸如获取代码库概览、查找特定功能的实现位置、审阅文档或从多个配置文件中收集上下文等任务。

### 参数

`read_many_files` 接受以下参数：

- `paths` (list[string], 必需):相对于该工具的目标目录的 glob 模式或路径数组
  (例如, `["src/**/*.ts"]`, `["README.md", "docs/", "assets/logo.png"]`).
- `exclude` (list[string], 可选): 用于排除文件/目录的 Glob 模式 (例如
  `["**/*.log", "temp/"]`). 如果 `useDefaultExcludes` 为
  true,这些模式将被添加到默认排除项中.
- `include` (list[string], 可选): 要包含的其他 glob 模式。这些模式将与 `paths`
  合并 (例如, `["*.test.ts"]` 可用于在测试文件被广泛排除时专门添加它们, 或者
  `["images/*.jpg"]` 可用于包含特定的图像类型).
- `recursive` (boolean, 可选): 是否递归搜索。这主要由 glob 模式中的 `**`
  控制。默认为 `true`。
- `useDefaultExcludes` (boolean, 可选): 是否应用默认排除模式列表 (例如
  `node_modules`, `.git`, 非图像/pdf 二进制文件). 默认为 `true`.
- `respect_git_ignore` (boolean, 可选): 在查找文件时是否遵循 .gitignore
  模式。默认为 true.

## 如何将 `read_many_files` 与 Gemini CLI 结合使用

`read_many_files` 会搜索与提供的 `paths` 和 `include` 模式匹配的文件，同时遵循
`exclude` 模式和默认排除项（如果启用）。

- 对于文本文件：它会读取每个匹配文件的内容（尝试跳过未明确请求为图像/PDF
  的二进制文件）并将其连接成一个字符串，每个文件的内容之间用分隔符
  `--- {filePath} ---` 分隔。默认使用 UTF-8 编码。
- 对于图像和 PDF 文件：如果通过名称或扩展名明确请求（例如 `paths: ["logo.png"]`
  或 `include: ["*.pdf"]`），该工具会读取文件并将其内容作为 base64
  编码的字符串返回。
- 该工具会通过检查其初始内容中的空字节来尝试检测并跳过其他二进制文件（那些与常见图像/PDF
  类型不匹配或未明确请求的二进制文件）。

用法：

```
read_many_files(paths=["此处填写您的文件或路径。"], include=["要包含的其他文件。"], exclude=["要排除的文件。"], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` 示例

读取 `src` 目录中的所有 TypeScript 文件：

```
read_many_files(paths=["src/**/*.ts"])
```

读取主 README、`docs` 目录中的所有 Markdown
文件以及一个特定的徽标图像，同时排除一个特定文件：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

读取所有 JavaScript 文件，但明确包含测试文件和 `images` 文件夹中的所有 JPEG
文件：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要说明

- **二进制文件处理:**
  - **图像/PDF 文件:** 该工具可以读取常见的图像类型 (PNG, JPEG 等) 和 PDF 文件,
    并将它们作为 base64 编码的数据返回. 这些文件*必须*由 `paths` 或 `include`
    模式明确指定 (例如, 通过指定确切的文件名,如 `image.png` 或模式 `*.jpeg`).
  - **其他二进制文件:**
    该工具会通过检查其初始内容中的空字节来尝试检测并跳过其他类型的二进制文件。该工具会从其输出中排除这些文件。
- **性能:** 读取大量文件或非常大的单个文件可能会占用大量资源。
- **路径特异性:** 确保相对于工具的目标目录正确指定路径和 glob 模式。对于图像/PDF
  文件，确保模式足够具体以包含它们。
- **默认排除:** 请注意默认的排除模式 (如 `node_modules`, `.git`),
  如果需要覆盖它们,请使用 `useDefaultExcludes=False`, 但请谨慎操作.
