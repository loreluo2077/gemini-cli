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
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import stripJsonComments from 'strip-json-comments';
import os from 'os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';

const argv = yargs(hideBin(process.argv)).option('q', {
  alias: 'quiet',
  type: 'boolean',
  default: false,
}).argv;

let geminiSandbox = process.env.GEMINI_SANDBOX;

if (!geminiSandbox) {
  const userSettingsFile = join(os.homedir(), '.gemini', 'settings.json');
  if (existsSync(userSettingsFile)) {
    const settings = JSON.parse(
      stripJsonComments(readFileSync(userSettingsFile, 'utf-8')),
    );
    if (settings.sandbox) {
      geminiSandbox = settings.sandbox;
    }
  }
}

if (!geminiSandbox) {
  let currentDir = process.cwd();
  while (currentDir !== '/') {
    const geminiEnv = join(currentDir, '.gemini', '.env');
    const regularEnv = join(currentDir, '.env');
    if (existsSync(geminiEnv)) {
      dotenv.config({ path: geminiEnv });
      break;
    } else if (existsSync(regularEnv)) {
      dotenv.config({ path: regularEnv });
      break;
    }
    currentDir = dirname(currentDir);
  }
  geminiSandbox = process.env.GEMINI_SANDBOX;
}

geminiSandbox = (geminiSandbox || '').toLowerCase();

const commandExists = (cmd) => {
  const checkCommand = os.platform() === 'win32' ? 'where' : 'command -v';
  if (!argv.q) {
    console.log(`[SANDBOX] 检查命令是否存在: ${cmd}`);
  }
  try {
    const startTime = Date.now();
    execSync(`${checkCommand} ${cmd}`, {
      stdio: 'ignore',
      timeout: 5000, // 5秒超时
    });
    const endTime = Date.now();
    if (!argv.q) {
      console.log(
        `[SANDBOX] 命令 ${cmd} 存在，检查耗时: ${endTime - startTime}ms`,
      );
    }
    return true;
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      if (!argv.q) {
        console.log(`[SANDBOX] 警告: 检查命令 ${cmd} 超时`);
      }
      return false;
    }
    if (os.platform() === 'win32') {
      try {
        const startTime = Date.now();
        execSync(`${checkCommand} ${cmd}.exe`, {
          stdio: 'ignore',
          timeout: 5000, // 5秒超时
        });
        const endTime = Date.now();
        if (!argv.q) {
          console.log(
            `[SANDBOX] 命令 ${cmd}.exe 存在，检查耗时: ${endTime - startTime}ms`,
          );
        }
        return true;
      } catch (winError) {
        if (winError.code === 'TIMEOUT') {
          if (!argv.q) {
            console.log(`[SANDBOX] 警告: 检查命令 ${cmd}.exe 超时`);
          }
        } else if (!argv.q) {
          console.log(`[SANDBOX] 命令 ${cmd} 和 ${cmd}.exe 都不存在`);
        }
        return false;
      }
    }
    if (!argv.q) {
      console.log(`[SANDBOX] 命令 ${cmd} 不存在`);
    }
    return false;
  }
};

let command = '';
if (!argv.q) {
  console.log(`[SANDBOX] GEMINI_SANDBOX 配置: ${geminiSandbox || '未设置'}`);
  console.log(`[SANDBOX] 操作系统: ${os.platform()}`);
}

if (['1', 'true'].includes(geminiSandbox)) {
  if (!argv.q) {
    console.log('[SANDBOX] 启用沙箱模式，检查容器工具...');
  }
  if (commandExists('docker')) {
    command = 'docker';
  } else if (commandExists('podman')) {
    command = 'podman';
  } else {
    console.error(
      'ERROR: install docker or podman or specify command in GEMINI_SANDBOX',
    );
    process.exit(1);
  }
} else if (geminiSandbox && !['0', 'false'].includes(geminiSandbox)) {
  if (!argv.q) {
    console.log(`[SANDBOX] 使用自定义沙箱命令: ${geminiSandbox}`);
  }
  if (commandExists(geminiSandbox)) {
    command = geminiSandbox;
  } else {
    console.error(
      `ERROR: missing sandbox command '${geminiSandbox}' (from GEMINI_SANDBOX)`,
    );
    process.exit(1);
  }
} else {
  if (!argv.q) {
    console.log('[SANDBOX] 沙箱未启用或显式禁用');
  }
  if (os.platform() === 'darwin' && process.env.SEATBELT_PROFILE !== 'none') {
    if (!argv.q) {
      console.log('[SANDBOX] macOS平台，检查 sandbox-exec...');
    }
    if (commandExists('sandbox-exec')) {
      command = 'sandbox-exec';
    } else {
      if (!argv.q) {
        console.log('[SANDBOX] sandbox-exec 不可用');
      }
      process.exit(1);
    }
  } else {
    if (!argv.q) {
      console.log('[SANDBOX] 不使用沙箱');
    }
    process.exit(1);
  }
}

if (!argv.q) {
  console.log(command);
}
process.exit(0);
