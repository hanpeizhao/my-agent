# my-agent 启动手册（中文版）

一个生产级 CLI Agent，基于 TypeScript 构建，支持两阶段 skill 加载、内置工具、MCP 协议、会话管理。

---

## 一、安装

### 1. 安装依赖

```bash
cd D:/AI/my-agent
npm install
```

### 2. 配置 LLM（以 DeepSeek 为例）

**Windows Git Bash：**
```bash
export OPENAI_API_KEY="sk-your-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"
```

**Windows PowerShell：**
```powershell
$env:OPENAI_API_KEY="sk-your-key"
$env:OPENAI_BASE_URL="https://api.deepseek.com/v1"
$env:MODEL_NAME="deepseek-chat"
```

**Windows CMD：**
```cmd
set OPENAI_API_KEY=sk-your-key
set OPENAI_BASE_URL=https://api.deepseek.com/v1
set MODEL_NAME=deepseek-chat
```

**Linux/Mac：**
```bash
export OPENAI_API_KEY="sk-your-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"
```

### 3. 启动

**开发模式（直接运行 TS 源码）：**
```bash
npx tsx src/cli/agent-cli.ts
```

**或用 npm 脚本：**
```bash
npm start
```

启动成功后看到：
```
╔══════════════════════════════════╗
║       🤖 my-agent CLI            ║
╚══════════════════════════════════╝

✓ API Key configured
✓ Loaded 4 skill(s): flight, location, weather, web_search
✓ 5 builtin tools: activate_skill, read_file, write_file, bash, search
○ MCP: no .mcp.json or no servers configured

✓ Agent initialized
  Type /help for commands, or just start chatting

You:
```

---

## 二、注册为全局命令

注册后可以在**任意目录**运行 `my-agent` 启动 agent。

### 注册

```bash
cd D:/AI/my-agent
npm link
```

注册成功后会显示：
```
+ my-agent@1.0.0
added 1 package in 1s
```

### 在任意目录使用

```bash
cd D:/any/project
my-agent
```

agent 会读取**当前目录**的：
- `AGENTS.md`（如果存在）→ 注入 System Prompt 作为项目知识
- `.mcp.json`（如果存在）→ 加载 MCP Server
- `skills/`（如果存在）→ 加载 skill

### 卸载全局命令

```bash
npm unlink -g my-agent
```

---

## 三、命令系统

在 `You:` 提示符后输入命令。

### 通用命令

| 命令 | 作用 |
|------|------|
| `/help` | 显示帮助 |
| `/skills` | 列出所有 skill |
| `/sessions` | 列出所有会话 |
| `/new` | 开始新会话（清空当前上下文） |
| `/clear` | 清空当前对话上下文（保留 session 文件） |
| `/cls` | 只清屏（不清上下文） |
| `/load <id>` | 加载指定会话 |
| `/save [name]` | 保存当前会话 |
| `/exit` | 退出 |

### MCP 管理命令

| 命令 | 作用 |
|------|------|
| `/mcp list` | 列出 `.mcp.json` 中配置的 server |
| `/mcp add <name> <cmd> [args] [ENV=val]` | 添加 server（自动加载） |
| `/mcp remove <name>` | 删除 server（自动重载） |
| `/mcp reload` | 重新加载所有 server |
| `/mcp help` | 显示 MCP 命令帮助 |

---

## 四、MCP 使用

### 工作机制

1. **启动时**：agent 读取当前目录的 `.mcp.json`
2. **每个 server**：spawn 一个子进程，做 JSON-RPC 握手，列出工具
3. **工具命名**：MCP 工具以 `mcp__<server>__<tool>` 命名，如 `mcp__filesystem__read_file`
4. **路由**：LLM 调用 MCP 工具时，agent 路由到对应子进程

### 没有 .mcp.json 时

agent 正常启动，所有内置工具和 skill 照常工作。启动日志显示：
```
○ MCP: no .mcp.json or no servers configured
```

### 添加 MCP Server

**filesystem（文件系统访问）：**
```
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .
```

`.` 会自动展开为当前工作目录的绝对路径。

**GitHub（带 token）：**
```
/mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=ghp_xxx
```

参数中含 `=` 且前缀是大写下划线（如 `GITHUB_TOKEN`）会被识别为环境变量。

**SQLite：**
```
/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./data.db
```

### 添加后的效果

```
You: /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .

✓ Server "filesystem" added to D:\AI\my-agent\.mcp.json

正在加载新 server...

[McpLoader] Loading 1 MCP server(s): filesystem
[MCP:filesystem] ✓ Connected
[McpLoader] ✓ filesystem: 14 tools (read_file, ...)
✓ 当前共 1 个 server，14 个工具

You: 用 mcp 读 package.json
[AgentLoop] Tool call: mcp__filesystem__read_text_file
[AgentLoop] ✓ Executed via MCP: mcp__filesystem__read_text_file

🤖 Assistant:
项目名是 my-agent（版本 1.0.0）...
```

### 删除 MCP Server

```
/mcp remove filesystem
```

会自动重新加载，立即生效。

### 手动编辑 .mcp.json 后重载

```
/mcp reload
```

### MCP 生态系统

**MCP 是开放协议** - 你可以接入任何实现了 MCP 协议的 server，不限于特定几个。只要程序支持 MCP 协议（通过 stdio 的 JSON-RPC 2.0），就能集成到 my-agent。

#### Anthropic 官方 Servers（Node.js）

| Server | 用途 | 添加命令 |
|--------|------|---------|
| **filesystem** | 文件系统访问 | `/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .` |
| **github** | GitHub 操作 | `/mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=xxx` |
| **sqlite** | SQLite 数据库 | `/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./data.db` |
| **postgresql** | PostgreSQL 数据库 | `/mcp add postgresql npx -y @modelcontextprotocol/server-postgres postgresql://localhost/db` |
| **puppeteer** | 浏览器自动化 | `/mcp add puppeteer npx -y @modelcontextprotocol/server-puppeteer` |
| **slack** | Slack 集成 | `/mcp add slack npx -y @modelcontextprotocol/server-slack SLACK_TOKEN=xxx` |
| **google-drive** | Google Drive 访问 | `/mcp add gdrive npx -y @modelcontextprotocol/server-google-drive` |
| **memory** | 持久化记忆 | `/mcp add memory npx -y @modelcontextprotocol/server-memory` |
| **brave-search** | Brave 网页搜索 | `/mcp add brave npx -y @modelcontextprotocol/server-brave-search BRAVE_API_KEY=xxx` |
| **gitlab** | GitLab 操作 | `/mcp add gitlab npx -y @modelcontextprotocol/server-gitlab GITLAB_TOKEN=xxx` |

#### 社区维护的 Servers（Python via uvx）

许多社区 server 使用 Python 编写。先安装 [uv](https://github.com/astral-sh/uv)，然后用 `uvx`：

```bash
# Notion 集成
/mcp add notion uvx -y mcp-server-notion NOTION_TOKEN=xxx

# Jira 集成
/mcp add jira uvx -y mcp-server-jira JIRA_URL=https://xxx.atlassian.net JIRA_TOKEN=xxx

# 抓取网页内容
/mcp add fetch uvx -y mcp-server-fetch

# Redis 数据库
/mcp add redis uvx -y mcp-server-redis REDIS_URL=redis://localhost:6379

# MongoDB
/mcp add mongodb uvx -y mcp-server-mongodb MONGODB_URI=mongodb://localhost:27017
```

#### 自定义 Servers

你可以运行任何可执行文件作为 MCP server：

```json
{
  "mcpServers": {
    "my-custom-server": {
      "command": "node",
      "args": ["./my-server/index.js"],
      "env": {}
    },
    "python-server": {
      "command": "python",
      "args": ["./server.py"]
    }
  }
}
```

或通过命令直接添加：
```bash
/mcp add custom node ./my-server/index.js
```

#### 查找更多 MCP Servers

- **官方仓库**: https://github.com/modelcontextprotocol/servers
- **社区整理**: https://github.com/punkpeye/awesome-mcp-servers
- **可视化浏览**: https://mcpservers.org

## 创建自定义 MCP Server

你可以创建自己的 MCP server 来扩展 my-agent 的能力。本指南将带你从零开始构建一个完整的系统信息服务器。

### 项目结构

```bash
mcp/system-info/
├── package.json           # 依赖和脚本
├── tsconfig.json          # TypeScript 配置
└── src/
    └── index.ts           # 服务器实现
```

### 第一步：初始化项目

```bash
# 创建项目目录
mkdir -p mcp/system-info/src
cd mcp/system-info

# 初始化 package.json
npm init -y

# 安装依赖
npm install typescript @types/node --save-dev
npm install zod --save
```

### 第二步：配置 TypeScript

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

更新 `package.json` 添加构建脚本：

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

### 第三步：实现 MCP Server

创建 `src/index.ts`：

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

// 定义可用工具
const TOOLS = [
  {
    name: "get_system_info",
    description: "获取详细的系统信息（操作系统、CPU、内存）",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "directory_stats",
    description: "获取目录统计信息（文件数量、总大小）",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "要分析的目录路径" }
      },
      required: ["path"]
    }
  },
  {
    name: "find_large_files",
    description: "在目录中查找最大的文件",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "要搜索的目录" },
        limit: { type: "number", description: "返回的最大文件数（默认10）" }
      },
      required: ["path"]
    }
  },
  {
    name: "get_network_info",
    description: "获取网络接口和公网IP地址",
    inputSchema: { type: "object", properties: {} }
  }
];

// 工具实现
async function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    version: os.version(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
    hostname: os.hostname(),
    uptime: Math.round(os.uptime() / 60) + ' 分钟'
  };
}

async function directoryStats(dirPath: string) {
  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`${dirPath} 不是目录`);
  }

  const entries = await fs.readdir(dirPath);
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const entryStats = await fs.stat(fullPath);
    
    if (entryStats.isFile()) {
      fileCount++;
      totalSize += entryStats.size;
    } else if (entryStats.isDirectory()) {
      dirCount++;
    }
  }

  return {
    path: dirPath,
    fileCount,
    directoryCount: dirCount,
    totalSize: Math.round(totalSize / 1024) + ' KB'
  };
}

async function findLargeFiles(dirPath: string, limit = 10) {
  const files: Array<{ path: string; size: number }> = [];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = await fs.stat(fullPath);
      
      if (stats.isFile()) {
        files.push({ path: fullPath, size: stats.size });
      } else if (stats.isDirectory()) {
        await scan(fullPath);
      }
    }
  }

  await scan(dirPath);
  
  files.sort((a, b) => b.size - a.size);
  return files.slice(0, limit).map(f => ({
    path: f.path,
    size: Math.round(f.size / 1024) + ' KB'
  }));
}

async function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const result: Record<string, string[]> = {};
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (addrs) {
      result[name] = addrs.map(a => a.address);
    }
  }

  // 获取公网 IP
  try {
    const response = await fetch('https://api.ipify.org');
    const publicIp = await response.text();
    result['public'] = [publicIp];
  } catch {
    result['public'] = ['无法获取'];
  }

  return result;
}

// 创建并配置服务器
const server = new Server(
  {
    name: "system-info-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// 处理工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    
    switch (name) {
      case "get_system_info":
        result = await getSystemInfo();
        break;
      case "directory_stats":
        result = await directoryStats(args.path);
        break;
      case "find_large_files":
        result = await findLargeFiles(args.path, args.limit);
        break;
      case "get_network_info":
        result = await getNetworkInfo();
        break;
      default:
        throw new Error(`未知工具: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `错误: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("System Info MCP Server 运行在 stdio");
}

main().catch((error) => {
  console.error("致命错误:", error);
  process.exit(1);
});
```

### 第四步：构建服务器

```bash
# 编译 TypeScript 为 JavaScript
npm run build

# 输出: dist/index.js
```

### 第五步：注册到 Agent

在 agent 根目录的 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "system-info": {
      "command": "node",
      "args": ["./mcp/system-info/dist/index.js"],
      "env": {}
    }
  }
}
```

或使用命令添加：

```bash
/mcp add system-info node ./mcp/system-info/dist/index.js
```

### 第六步：测试

重启 agent 后尝试这些命令：

```
You: 获取系统信息
You: 分析 D:/AI/my-agent/skills 目录
You: 找出 node_modules 中最大的 5 个文件
You: 显示网络信息和公网 IP
```

预期输出示例：

```
🤖 Assistant:

以下是系统信息：

**💻 系统概览**
- 平台: Windows 11 (win32)
- 架构: x64
- 主机名: MY-COMPUTER
- CPU: 8 核
- 总内存: 16 GB
- 可用内存: 8 GB
- 运行时间: 120 分钟

**🌐 网络接口**
- 以太网: 192.168.1.100
- Wi-Fi: 192.168.1.101
- 公网 IP: 203.0.113.50
```

### 开发工作流

| 任务 | 命令 | 频率 |
|------|------|------|
| 初始设置 | `npm install && npm run build` | 一次性 |
| 代码修改 | 编辑 `src/index.ts` 然后 `npm run build` | 每次修改代码后 |
| 测试修改 | 重启 agent 或 `/mcp reload` | 重新构建后 |
| 删除服务器 | `/mcp remove system-info` | 完成时 |

### 关键要点

✅ **一次性准备**：编写代码后只需构建一次  
✅ **自动生命周期管理**：Agent 自动启动/停止服务器  
✅ **热重载**：使用 `/mcp reload` 无需退出 agent 即可重启  
✅ **多服务器支持**：可以同时运行多个自定义服务器  
✅ **语言无关**：可以用 Python、Rust、Go 等编写服务器  

### 故障排除

**服务器无法启动：**
```bash
# 检查是否成功编译
ls dist/index.js

# 重新构建
npm run build

# 手动测试
node dist/index.js
```

**Agent 无法连接：**
- 验证 `.mcp.json` 指向正确路径
- 确保服务器有执行权限
- 检查 agent stderr 输出中的服务器日志

**工具未出现：**
- 重新构建后运行 `/mcp reload`
- 验证服务器实现了 `ListToolsRequestSchema`
- 检查工具定义是否符合 MCP 协议

---

## 五、添加新 Skill

### 1. 创建 skill 目录

```bash
mkdir skills/my-skill
```

### 2. 写 `SKILL.md`（LLM 读）

```markdown
---
name: my-skill
description: 这个 skill 干什么
trigger: 什么场景下使用
---

# 我的技能

## my_tool

参数:
- arg1 (string, 必填): 参数说明

返回:
- result: 返回说明
```

### 3. 写 `index.js`（runtime 执行）

```javascript
export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'my_tool',
          description: '工具描述',
          parameters: {
            type: 'object',
            properties: {
              arg1: { type: 'string', description: '参数说明' }
            },
            required: ['arg1']
          }
        }
      },
      handler: async (args) => {
        // 你的实现
        return { result: '...' };
      }
    }
  ]
};
```

### 4. 重启 CLI

新 skill 自动被发现，LLM 会看到索引并在需要时调用 `activate_skill("my-skill")` 激活。

---

## 六、切换 LLM

支持所有 OpenAI 兼容协议的 LLM：

**OpenAI GPT 系列：**
```bash
export OPENAI_API_KEY="sk-xxx"
# OPENAI_BASE_URL 默认 https://api.openai.com/v1
export MODEL_NAME="gpt-4o"
```

**DeepSeek：**
```bash
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"
```

**本地 Ollama：**
```bash
export OPENAI_API_KEY="ollama"
export OPENAI_BASE_URL="http://localhost:11434/v1"
export MODEL_NAME="llama3"
```

**阿里通义千问：**
```bash
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MODEL_NAME="qwen-plus"
```

---

## 七、AGENTS.md（可选项目知识库）

在当前目录创建 `AGENTS.md`，内容会自动注入 System Prompt 作为项目知识。

适用场景：
- 项目规则、约定
- 代码风格
- 常见问答 FAQ
- 架构说明

**没有 AGENTS.md 时**：agent 正常启动，不影响功能。

---

## 八、错误处理与稳定性

Agent 设计为对 skill 失败和意外错误具有弹性。

### 异常保护层次

```
skill handler 抛出异常
        ↓
[第1层] SkillManager.executeTool() 的 try-catch    ← 捕获同步/异步错误
        ↓ 返回 { isError: true } 给 LLM
[第2层] AgentLoop.executeToolCall()                 ← 继续执行
        ↓ 将错误作为工具消息发回 LLM
[第3层] AgentCLI.handleUserMessage() 的 try-catch   ← 外层安全网
        ↓ 向用户显示 "❌ Error:"
[第4层] 全局进程处理器                               ← 最后防线
        - unhandledRejection: 记录警告，继续运行
        - uncaughtException: 记录错误，继续运行
```

### 已保护的异常（不会导致 CLI 崩溃）

| 场景 | 保护层次 | 结果 |
|------|---------|------|
| skill handler 中 `throw new Error()` | SkillManager try-catch | ✅ 返回错误给 LLM，CLI 继续运行 |
| `await fetch()` 网络超时 | SkillManager try-catch | ✅ 返回错误给 LLM，CLI 继续运行 |
| 返回值存在循环引用 | SkillManager try-catch | ✅ JSON.stringify 失败被捕获，CLI 继续运行 |
| 后台未处理的 Promise 拒绝 | `process.on('unhandledRejection')` | ✅ 记录警告，CLI 继续运行 |
| 意外的同步异常 | `process.on('uncaughtException')` | ✅ 记录错误，CLI 继续运行 |
| LLM API 调用失败 | handleUserMessage try-catch | ✅ 向用户显示错误，CLI 继续运行 |

### 仍可能导致崩溃的情况（无法避免）

某些场景 **Node.js 无法捕获**，会终止进程：

| 场景 | 为什么无法阻止 | 后果 |
|------|--------------|------|
| skill 代码中 `process.exit(1)` | 操作系统级进程终止 | CLI 立即退出 |
| 无限循环 / 内存爆炸 | 没有抛出异常，只是卡死或 OOM | CLI 冻结或被系统 kill |
| Native addon 段错误 | C++ 层崩溃，JS 层无法拦截 | 进程立即死亡 |
| `bash` 执行 `kill $$` | 在操作系统层面杀死自己的进程 | CLI 退出 |

**注意**：正常的第三方 skill 不会调用 `process.exit()`。当前的保护机制对日常使用已经足够。

### MCP Server 隔离

MCP server 作为**独立子进程**运行，提供额外的稳定性：

- MCP server 崩溃 → 只有该 server 的工具不可用，主 CLI 继续运行
- 主 CLI 崩溃 → MCP server 被操作系统自动终止
- MCP 中的内存泄漏 → 限制在该进程内，不影响主 CLI

### Skill 开发者的最佳实践

编写自定义 skill 时，遵循以下指南以确保稳定性：

```javascript
// ✅ 好的做法：正确的错误处理
handler: async (args) => {
  try {
    const result = await someAsyncOperation();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ❌ 不好的做法：未处理的 Promise 拒绝
handler: async (args) => {
  setTimeout(() => {
    throw new Error('后台错误'); // 会触发 unhandledRejection
  }, 100);
  return { ok: true };
}

// ❌ 不好的做法：进程终止
handler: async (args) => {
  process.exit(1); // 会杀死整个 CLI！
}
```

### 调试崩溃问题

如果 CLI 意外崩溃：

1. **检查错误输出** - 查看崩溃前的堆栈跟踪
2. **启用详细日志** - 设置 `DEBUG=*` 环境变量
3. **单独测试 skill** - 在 Node REPL 中直接运行 skill handler
4. **检查 MCP server 日志** - MCP stderr 输出被捕获在 agent 日志中

调试命令示例：
```bash
# 启用调试日志
export DEBUG=my-agent:*
npx tsx src/cli/agent-cli.ts
```

---

## 九、两阶段 Skill 加载

### 传统方式 vs 本项目

| 方式 | System Prompt 内容 | Token 消耗（3 个 skill） |
|------|-------------------|----------------------|
| 传统 | 所有 SKILL.md 完整内容 | 1489 tokens / 每次 LLM 调用 |
| 本项目 | 只放 skill 索引 | 804 tokens / 每次 LLM 调用 |

### 工作流程

```
用户提问
  ↓
LLM 看 System Prompt 中的 skill 索引
  ↓
LLM 调用 activate_skill("weather")
  ↓
agent 动态 import skills/weather/index.js
  ↓
完整 SKILL.md 内容作为 tool result 返回给 LLM
  ↓
LLM 看到工具说明，调用 get_weather({city: "北京"})
  ↓
agent 执行工具，返回结果
  ↓
LLM 综合结果生成回复
```

### Token 节省效果

| Skill 数量 | 传统 | 本项目 | 节省 |
|----------|------|-------|------|
| 3 | 1489 tokens | 804 tokens | 46% |
| 10 | ~3700 tokens | ~1000 tokens | 73% |
| 50 | ~7658 tokens | ~1179 tokens | 84.6% |
| 100 | ~15000 tokens | ~1500 tokens | 90% |

---

## 九、会话管理

会话文件自动保存到 `~/.my-agent/sessions/`。

```bash
/sessions           # 列出所有会话
/new                # 开始新会话
/save 项目名         # 保存当前会话
/load session-xxx   # 加载指定会话
/clear              # 清空当前上下文（保留 session 文件）
```

每个会话保存：
- 对话历史
- 创建时间
- 标题（自动从首条消息生成或手动指定）

---

## 十、工具调用优先级

当 LLM 决定调用工具时，agent 按以下优先级路由：

```
工具名以 mcp__ 开头？
  → 是：路由到对应 MCP Server 子进程
  → 否：尝试内置工具（read_file/write_file/bash/search/activate_skill）
       → 找不到：尝试已激活的 skill 工具
                → 找不到：返回错误
```

LLM 看到的工具列表 = 5 个内置 + 已激活的 skill 工具 + 所有 MCP 工具。

---

## 十一、环境变量速查

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | LLM API 密钥 | 必填 |
| `OPENAI_BASE_URL` | LLM API 地址 | `https://api.deepseek.com/v1` |
| `MODEL_NAME` | 模型名 | `deepseek-chat` |
| `SKILLS_DIR` | 自定义 skills 目录 | `<工作目录>/skills` |

---

## 十二、常见问题

### Q: 启动报 `ERR_REQUIRE_ESM`？

A: 不要用 `node dist/...`，要用 `npx tsx src/cli/agent-cli.ts`。chalk v5 是纯 ESM，tsx 直接跑 TS 源码无此问题。

### Q: MCP server 启动失败？

A: 检查：
1. `.mcp.json` 中的路径用正斜杠 `/`
2. filesystem server 必须传允许访问的目录参数（用 `.` 自动展开为当前目录）
3. 用 `/mcp list` 查看配置
4. 用 `/mcp reload` 重新加载

### Q: 输入文字没反应？

A: 检查是否在管道模式运行（`echo ... | my-agent`）。inquirer 需要 TTY，管道模式会卡住。直接在终端运行即可。

### Q: 如何在不同项目使用不同的 skill？

A: 在每个项目根目录建 `skills/` 子目录。启动 `my-agent` 时会自动读取当前目录的 skills。

### Q: 如何禁用 MCP？

A: 删除 `.mcp.json` 或运行 `/mcp remove <name>` 删除具体 server。MCP 是可选的，没有配置就跳过。

### Q: 如何更新到新版本？

A:
```bash
cd D:/AI/my-agent
git pull
npm install
```

---

## 十三、技术栈

- **运行时**：Node.js 20+ / ESM 模块系统
- **语言**：TypeScript 5.5
- **LLM 协议**：OpenAI 兼容（function calling）
- **交互**：inquirer（REPL）+ chalk（彩色输出）
- **无需编译**：用 tsx 直接运行 TS 源码

## 许可证

ISC
