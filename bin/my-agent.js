#!/usr/bin/env node

/**
 * my-agent CLI 全局入口
 *
 * 用法（注册为全局命令后）：
 *   my-agent              # 在任意目录启动
 *   my-agent --help       # 显示帮助
 *
 * 全局注册：
 *   cd D:/AI/my-agent
 *   npm link
 *
 * 卸载全局命令：
 *   npm unlink -g my-agent
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 找到 src/cli/agent-cli.ts
const tsEntry = join(__dirname, '..', 'src', 'cli', 'agent-cli.ts');

if (!existsSync(tsEntry)) {
  console.error(`[my-agent] Cannot find entry: ${tsEntry}`);
  console.error('Please run "npm install" first.');
  process.exit(1);
}

// 用 tsx 直接运行 TypeScript 源码（避免编译步骤）
const child = spawn('npx', ['tsx', tsEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

child.on('error', (err) => {
  console.error('[my-agent] Failed to start:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
