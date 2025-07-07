/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law_or_agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// check build status, write warnings to file for app to display if needed
console.log('[START] 开始检查构建状态...');
const buildCheckStartTime = Date.now();
try {
  execSync('node ./scripts/check-build-status.js', {
    stdio: 'inherit',
    cwd: root,
    timeout: 30000, // 30秒超时
  });
  const buildCheckEndTime = Date.now();
  console.log(
    `[START] 构建状态检查完成，耗时: ${buildCheckEndTime - buildCheckStartTime}ms`,
  );
} catch (error) {
  console.log(`[START] 构建状态检查失败: ${error.message}`);
  if (error.code === 'TIMEOUT') {
    console.log('[START] 警告: 构建状态检查超时，可能文件系统IO卡住了');
  }
  process.exit(1);
}

const nodeArgs = [];
let sandboxCommand = undefined;

console.log('[START] 开始获取沙箱命令...');
try {
  console.log('[START] 执行: node scripts/sandbox_command.js');
  const startTime = Date.now();
  sandboxCommand = execSync('node scripts/sandbox_command.js', {
    cwd: root,
    timeout: 10000, // 10秒超时
  })
    .toString()
    .trim();
  const endTime = Date.now();
  console.log(`[START] 沙箱命令获取成功，耗时: ${endTime - startTime}ms`);
  if (sandboxCommand) {
    console.log(`[START] 沙箱命令: ${sandboxCommand}`);
  } else {
    console.log('[START] 未使用沙箱');
  }
} catch (error) {
  console.log(`[START] 沙箱命令获取失败: ${error.message}`);
  if (error.code === 'TIMEOUT') {
    console.log(
      '[START] 警告: 沙箱命令获取超时，可能是 docker/podman 检查卡住了',
    );
  }
  // ignore
}
// if debugging is enabled and sandboxing is disabled, use --inspect-brk flag
// note with sandboxing this flag is passed to the binary inside the sandbox
// inside sandbox SANDBOX should be set and sandbox_command.js should fail
console.log('[START] 配置启动参数...');
if (process.env.DEBUG && !sandboxCommand) {
  console.log('[START] 检测到DEBUG模式，添加调试参数');
  if (process.env.SANDBOX) {
    const port = process.env.DEBUG_PORT || '9229';
    nodeArgs.push(`--inspect-brk=0.0.0.0:${port}`);
    console.log(`[START] 添加调试参数: --inspect-brk=0.0.0.0:${port}`);
  } else {
    nodeArgs.push('--inspect-brk');
    console.log('[START] 添加调试参数: --inspect-brk');
  }
} else if (process.env.DEBUG) {
  console.log(
    '[START] DEBUG模式已启用，但使用沙箱，调试参数将传递给沙箱内的进程',
  );
}

nodeArgs.push('./packages/cli');
nodeArgs.push(...process.argv.slice(2));

const env = {
  ...process.env,
  CLI_VERSION: pkg.version,
  DEV: 'true',
};

if (process.env.DEBUG) {
  // If this is not set, the debugger will pause on the outer process rather
  // than the relauncehd process making it harder to debug.
  env.GEMINI_CLI_NO_RELAUNCH = 'true';
  console.log('[START] 设置 GEMINI_CLI_NO_RELAUNCH=true 以便调试');
}

console.log('[START] 最终启动参数:');
console.log(`[START]   node ${nodeArgs.join(' ')}`);
console.log(`[START]   CLI_VERSION: ${env.CLI_VERSION}`);
console.log(`[START]   DEV: ${env.DEV}`);
if (env.GEMINI_CLI_NO_RELAUNCH) {
  console.log(
    `[START]   GEMINI_CLI_NO_RELAUNCH: ${env.GEMINI_CLI_NO_RELAUNCH}`,
  );
}

console.log('[START] 启动子进程...');
const spawnStartTime = Date.now();
const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('spawn', () => {
  const spawnEndTime = Date.now();
  console.log(
    `[START] 子进程启动成功，PID: ${child.pid}，耗时: ${spawnEndTime - spawnStartTime}ms`,
  );
});

child.on('error', (error) => {
  console.error(`[START] 子进程启动失败: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`[START] 子进程退出，退出码: ${code}`);
  process.exit(code);
});
