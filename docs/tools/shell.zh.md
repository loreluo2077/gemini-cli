# Shell 工具 (`run_shell_command`)

本文档介绍 Gemini CLI 的 `run_shell_command` 工具。

## 描述

使用 `run_shell_command`
与底层系统交互、运行脚本或执行命令行操作。`run_shell_command` 执行给定的 shell
命令。在 Windows 上，该命令将使用 `cmd.exe /c` 执行。在其他平台上，该命令将使用
`bash -c` 执行。

### 参数

`run_shell_command` 接受以下参数：

- `command` (字符串, 必需): 要执行的确切 shell 命令。
- `description` (字符串, 可选): 命令用途的简要说明，将显示给用户。
- `directory` (字符串, 可选):
  执行命令的目录（相对于项目根目录）。如果未提供，则该命令在项目根目录中运行。

## 如何将 `run_shell_command` 与 Gemini CLI 结合使用

使用 `run_shell_command` 时，该命令作为子进程执行。`run_shell_command` 可以使用
`&` 启动后台进程。该工具返回有关执行的详细信息，包括：

- `Command`: 已执行的命令。
- `Directory`: 命令运行所在的目录。
- `Stdout`: 标准输出流的输出。
- `Stderr`: 标准错误流的输出。
- `Error`: 子进程报告的任何错误消息。
- `Exit Code`: 命令的退出代码。
- `Signal`: 如果命令被信号终止，则为信号编号。
- `Background PIDs`: 启动的任何后台进程的 PID 列表。

用法：

```
run_shell_command(command="您的命令。", description="您对命令的描述。", directory="您的执行目录。")
```

## `run_shell_command` 示例

列出当前目录中的文件：

```
run_shell_command(command="ls -la")
```

在特定目录中运行脚本：

```
run_shell_command(command="./my_script.sh", directory="scripts", description="运行我的自定义脚本")
```

启动后台服务器：

```
run_shell_command(command="npm run dev &", description="在后台启动开发服务器")
```

## 重要说明

- **安全性:** 执行命令时要小心，尤其是由用户输入构成的命令，以防止安全漏洞。
- **交互式命令:**
  避免需要交互式用户输入的命令，因为这可能导致工具挂起。如果可用，请使用非交互式标志
  (例如, `npm init -y`)。
- **错误处理:** 检查 `Stderr`、`Error` 和 `Exit Code`
  字段以确定命令是否成功执行。
- **后台进程:** 当命令使用 `&`
  在后台运行时，该工具将立即返回，并且该进程将继续在后台运行。`Background PIDs`
  字段将包含后台进程的进程 ID。
