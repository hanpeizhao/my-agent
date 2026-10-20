# my-agent

A production-grade CLI Agent built with TypeScript, featuring two-phase skill loading, builtin tools, MCP protocol support, and session management.

## Features

- **Interactive REPL** - Based on `inquirer`, supports command history
- **Two-Phase Skill Loading** - System Prompt only carries skill index; full SKILL.md is returned as tool result upon `activate_skill`. Saves ~46% tokens with 3 skills, ~84% with 50.
- **5 Builtin Tools** - `activate_skill`, `read_file`, `write_file`, `bash`, `search`
- **MCP Protocol Support** - Auto-loads `.mcp.json` from current directory. Run `/mcp add` to add servers at runtime.
- **SKILL.md Format** - Each skill is a Markdown file (LLM-readable) + `index.js` (runtime-executable)
- **Session Management** - Auto-saves conversation history to `~/.my-agent/sessions/`
- **AGENTS.md** - Optional project knowledge file, auto-injected into System Prompt if present

## Quick Start

### 1. Install dependencies

```bash
cd D:/AI/my-agent
npm install
```

### 2. Configure LLM (DeepSeek as example)

**Windows Git Bash:**
```bash
export OPENAI_API_KEY="sk-your-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"
```

**Windows PowerShell:**
```powershell
$env:OPENAI_API_KEY="sk-your-key"
$env:OPENAI_BASE_URL="https://api.deepseek.com/v1"
$env:MODEL_NAME="deepseek-chat"
```

**Windows CMD:**
```cmd
set OPENAI_API_KEY=sk-your-key
set OPENAI_BASE_URL=https://api.deepseek.com/v1
set MODEL_NAME=deepseek-chat
```

**Linux/Mac:**
```bash
export OPENAI_API_KEY="sk-your-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"
```

### 3. Run the agent

```bash
# Direct run (development)
npx tsx src/cli/agent-cli.ts

# Or via npm script
npm start
```

### 4. Register as global command (optional)

After this step, you can run `my-agent` from **any directory** on your system:

```bash
cd D:/AI/my-agent
npm link
```

Now `my-agent` is available globally:

```bash
cd D:/any/project
my-agent    # ← starts the agent in current directory
```

**Unregister:**
```bash
npm unlink -g my-agent
```

## Project Structure

```
my-agent/
├── AGENTS.md                        # Project knowledge (auto-injected if exists)
├── .mcp.json                        # MCP servers config (auto-loaded if exists)
├── bin/my-agent.js                  # Global CLI entry
├── src/
│   ├── builtin/builtin-tools.ts     # 5 builtin tools
│   ├── cli/
│   │   ├── agent-cli.ts             # REPL entry
│   │   └── commands.ts              # /help /skills /mcp etc.
│   ├── core/
│   │   ├── agent-loop.ts            # ReAct loop
│   │   ├── session-manager.ts       # Session persistence
│   │   └── types.ts                 # Type definitions
│   ├── llm/openai-client.ts        # OpenAI-compatible LLM client
│   ├── mcp/
│   │   ├── mcp-client.ts           # JSON-RPC client
│   │   ├── mcp-loader.ts           # Server loader + config CRUD
│   │   └── mcp-transport.ts        # stdio transport
│   ├── prompt/builder.ts            # System Prompt builder
│   └── skills/
│       ├── skill-md.ts              # SKILL.md parser
│       └── skill-manager.ts         # Skill scanner + activator
├── skills/                          # User-editable skills
│   ├── flight/{SKILL.md, index.js}
│   ├── location/{SKILL.md, index.js}
│   ├── weather/{SKILL.md, index.js}
│   └── web_search/{SKILL.md, index.js}
├── package.json
└── tsconfig.json
```

## Builtin Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `activate_skill` | Activate an external skill | `skillName` (required) |
| `read_file` | Read file content | `path` (required), `maxLines` (optional) |
| `write_file` | Write to file | `path`, `content` (required), `append` (optional) |
| `bash` | Execute shell command | `command` (required), `cwd`, `timeout` (optional) |
| `search` | Search text in files | `pattern` (required), `path`, `glob`, `maxResults` (optional) |

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/skills` | List all skills |
| `/mcp list` | List configured MCP servers |
| `/mcp add <name> <cmd> [args] [ENV=val]` | Add MCP server (auto-loads) |
| `/mcp remove <name>` | Remove MCP server (auto-reloads) |
| `/mcp reload` | Reload all MCP servers |
| `/mcp help` | MCP subcommand help |
| `/sessions` | List saved sessions |
| `/new` | Start new session (clears context) |
| `/clear` | Clear conversation context (keeps session file) |
| `/cls` | Clear screen only |
| `/load <id>` | Load a session |
| `/save [name]` | Save current session |
| `/exit` | Exit |

## MCP Support

MCP (Model Context Protocol) is automatically enabled if `.mcp.json` exists in current directory.

**MCP is an open protocol** - you can add ANY MCP-compatible server, not just specific ones. As long as a program implements the MCP protocol (JSON-RPC 2.0 over stdio), it can be integrated into my-agent.

### Add MCP Server

```bash
# filesystem server (use . for current directory)
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .

# GitHub server (with env token)
/mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=ghp_xxx

# SQLite server
/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./data.db
```

The placeholder `.` or `./` is auto-expanded to the current working directory's absolute path.

### Available MCP Servers

#### Official Anthropic Servers (Node.js)

| Server | Purpose | Add Command |
|--------|---------|-------------|
| **filesystem** | File system access | `/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .` |
| **github** | GitHub operations | `/mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=xxx` |
| **sqlite** | SQLite database | `/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./data.db` |
| **postgresql** | PostgreSQL database | `/mcp add postgresql npx -y @modelcontextprotocol/server-postgres postgresql://localhost/db` |
| **puppeteer** | Browser automation | `/mcp add puppeteer npx -y @modelcontextprotocol/server-puppeteer` |
| **slack** | Slack integration | `/mcp add slack npx -y @modelcontextprotocol/server-slack SLACK_TOKEN=xxx` |
| **google-drive** | Google Drive access | `/mcp add gdrive npx -y @modelcontextprotocol/server-google-drive` |
| **memory** | Persistent memory | `/mcp add memory npx -y @modelcontextprotocol/server-memory` |
| **brave-search** | Web search via Brave | `/mcp add brave npx -y @modelcontextprotocol/server-brave-search BRAVE_API_KEY=xxx` |
| **gitlab** | GitLab operations | `/mcp add gitlab npx -y @modelcontextprotocol/server-gitlab GITLAB_TOKEN=xxx` |

#### Community Servers (Python via uvx)

Many community-maintained servers use Python. Install [uv](https://github.com/astral-sh/uv) first, then use `uvx`:

```bash
# Notion integration
/mcp add notion uvx -y mcp-server-notion NOTION_TOKEN=xxx

# Jira integration
/mcp add jira uvx -y mcp-server-jira JIRA_URL=https://xxx.atlassian.net JIRA_TOKEN=xxx

# Fetch web content
/mcp add fetch uvx -y mcp-server-fetch

# Redis database
/mcp add redis uvx -y mcp-server-redis REDIS_URL=redis://localhost:6379

# MongoDB
/mcp add mongodb uvx -y mcp-server-mongodb MONGODB_URI=mongodb://localhost:27017
```

#### Custom Servers

You can run any executable as an MCP server:

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

Or add directly via command:
```bash
/mcp add custom node ./my-server/index.js
```

### Find More MCP Servers

- **Official repository**: https://github.com/modelcontextprotocol/servers
- **Community list**: https://github.com/punkpeye/awesome-mcp-servers
- **Visual browser**: https://mcpservers.org

### Manage MCP Servers

```bash
/mcp list                 # Show all configured servers
/mcp remove github        # Remove a server
/mcp reload               # Reload after editing .mcp.json manually
```

### How MCP Works

1. **Startup**: Agent reads `.mcp.json` from current directory
2. **For each server**: Spawns a child process, does JSON-RPC handshake, lists tools
3. **Tool naming**: MCP tools are prefixed with `mcp__<server>__<tool>`, e.g., `mcp__filesystem__read_file`
4. **Routing**: When LLM calls an MCP tool, agent routes to the corresponding child process

### If no `.mcp.json`

Agent starts without MCP support; all builtin tools and skills work normally. The startup log shows:
```
○ MCP: no .mcp.json or no servers configured
```

## Create Custom MCP Server

You can create your own MCP server to extend my-agent's capabilities. This guide walks you through building a complete system info server from scratch.

### Project Structure

```bash
mcp/system-info/
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── src/
    └── index.ts           # Server implementation
```

### Step 1: Initialize Project

```bash
# Create project directory
mkdir -p mcp/system-info/src
cd mcp/system-info

# Initialize package.json
npm init -y

# Install dependencies
npm install typescript @types/node --save-dev
npm install zod --save
```

### Step 2: Configure TypeScript

Create `tsconfig.json`:

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

Update `package.json` with build scripts:

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

### Step 3: Implement MCP Server

Create `src/index.ts`:

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

// Define available tools
const TOOLS = [
  {
    name: "get_system_info",
    description: "Get detailed system information (OS, CPU, memory)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "directory_stats",
    description: "Get statistics about a directory (file count, total size)",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to analyze" }
      },
      required: ["path"]
    }
  },
  {
    name: "find_large_files",
    description: "Find the largest files in a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to search" },
        limit: { type: "number", description: "Max number of files to return (default 10)" }
      },
      required: ["path"]
    }
  },
  {
    name: "get_network_info",
    description: "Get network interfaces and public IP address",
    inputSchema: { type: "object", properties: {} }
  }
];

// Tool implementations
async function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    version: os.version(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
    hostname: os.hostname(),
    uptime: Math.round(os.uptime() / 60) + ' minutes'
  };
}

async function directoryStats(dirPath: string) {
  const stats = await fs.stat(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`${dirPath} is not a directory`);
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

  // Get public IP
  try {
    const response = await fetch('https://api.ipify.org');
    const publicIp = await response.text();
    result['public'] = [publicIp];
  } catch {
    result['public'] = ['Unable to fetch'];
  }

  return result;
}

// Create and configure server
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

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool calls
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
        throw new Error(`Unknown tool: ${name}`);
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
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("System Info MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

### Step 4: Build the Server

```bash
# Compile TypeScript to JavaScript
npm run build

# Output: dist/index.js
```

### Step 5: Register in Agent

Add to `.mcp.json` in the agent root directory:

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

Or use the command:

```bash
/mcp add system-info node ./mcp/system-info/dist/index.js
```

### Step 6: Test It

Restart the agent and try these commands:

```
You: Get system information
You: Analyze the D:/AI/my-agent/skills directory
You: Find the 5 largest files in node_modules
You: Show network info and public IP
```

Expected output example:

```
🤖 Assistant:

Here's your system information:

**💻 System Overview**
- Platform: Windows 11 (win32)
- Architecture: x64
- Hostname: MY-COMPUTER
- CPUs: 8 cores
- Total Memory: 16 GB
- Free Memory: 8 GB
- Uptime: 120 minutes

**🌐 Network Interfaces**
- Ethernet: 192.168.1.100
- Wi-Fi: 192.168.1.101
- Public IP: 203.0.113.50
```

### Development Workflow

| Task | Command | Frequency |
|------|---------|-----------|
| Initial setup | `npm install && npm run build` | Once |
| Code changes | Edit `src/index.ts` then `npm run build` | Every time you modify code |
| Test changes | Restart agent or `/mcp reload` | After rebuild |
| Remove server | `/mcp remove system-info` | When done |

### Key Points

✅ **One-time preparation**: Only need to build once after writing code  
✅ **Automatic lifecycle**: Agent automatically starts/stops the server  
✅ **Hot reload**: Use `/mcp reload` to restart without quitting agent  
✅ **Multiple servers**: Can run multiple custom servers simultaneously  
✅ **Language agnostic**: Can write servers in Python, Rust, Go, etc.  

### Troubleshooting

**Server won't start:**
```bash
# Check if compiled successfully
ls dist/index.js

# Rebuild
npm run build

# Test manually
node dist/index.js
```

**Agent can't connect:**
- Verify `.mcp.json` points to correct path
- Ensure server has executable permissions
- Check server logs in agent stderr output

**Tools not appearing:**
- Run `/mcp reload` after rebuilding
- Verify server implements `ListToolsRequestSchema`
- Check tool definitions match MCP protocol

## Add a New Skill

### 1. Create skill directory

```bash
mkdir skills/my-skill
```

### 2. Write `SKILL.md` (LLM reads this)

```markdown
---
name: my-skill
description: What this skill does
trigger: When to use this skill
---

# My Skill

## my_tool

参数:
- arg1 (string, required): Description

返回:
- result: Description
```

### 3. Write `index.js` (runtime executes this)

```javascript
export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'my_tool',
          description: 'What this tool does',
          parameters: {
            type: 'object',
            properties: {
              arg1: { type: 'string', description: 'Description' }
            },
            required: ['arg1']
          }
        }
      },
      handler: async (args) => {
        // Your implementation
        return { result: '...' };
      }
    }
  ]
};
```

### 4. Restart CLI

The new skill is automatically discovered. LLM will see it in the skill index and can `activate_skill("my-skill")` when needed.

## Switch LLM Provider

Supports any OpenAI-compatible provider:

```bash
# OpenAI
export OPENAI_API_KEY="sk-xxx"
export MODEL_NAME="gpt-4o"
# OPENAI_BASE_URL defaults to https://api.openai.com/v1

# DeepSeek
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export MODEL_NAME="deepseek-chat"

# Local Ollama
export OPENAI_API_KEY="ollama"
export OPENAI_BASE_URL="http://localhost:11434/v1"
export MODEL_NAME="llama3"

# Qwen (Alibaba)
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MODEL_NAME="qwen-plus"
```

## AGENTS.md (Optional)

If you create `AGENTS.md` in the project root, its content will be auto-injected into the System Prompt as project knowledge. Useful for:

- Project conventions
- Code style guidelines
- FAQ
- Architecture notes

## Error Handling & Stability

The agent is designed to be resilient against skill failures and unexpected errors.

### Exception Protection Layers

```
skill handler throws exception
        ↓
[Layer 1] SkillManager.executeTool() try-catch    ← Catches sync/async errors
        ↓ Returns { isError: true } to LLM
[Layer 2] AgentLoop.executeToolCall()             ← Continues execution
        ↓ Sends error as tool message back to LLM
[Layer 3] AgentCLI.handleUserMessage() try-catch  ← Outer safety net
        ↓ Shows "❌ Error:" to user
[Layer 4] Global process handlers               ← Last resort
        - unhandledRejection: Logs warning, keeps running
        - uncaughtException: Logs error, keeps running
```

### What's Protected (Won't Crash CLI)

| Scenario | Protection Layer | Result |
|----------|-----------------|--------|
| `throw new Error()` in skill handler | SkillManager try-catch | ✅ Returns error to LLM, CLI continues |
| Network timeout in `await fetch()` | SkillManager try-catch | ✅ Returns error to LLM, CLI continues |
| Circular reference in return value | SkillManager try-catch | ✅ JSON.stringify fails caught, CLI continues |
| Unhandled Promise rejection in background | `process.on('unhandledRejection')` | ✅ Warning logged, CLI keeps running |
| Unexpected synchronous error | `process.on('uncaughtException')` | ✅ Error logged, CLI keeps running |
| LLM API call failure | handleUserMessage try-catch | ✅ Error shown to user, CLI continues |

### What Can Still Crash (Unavoidable)

Some scenarios **cannot** be caught by Node.js and will terminate the process:

| Scenario | Why Unpreventable | Consequence |
|----------|------------------|-------------|
| `process.exit(1)` in skill code | OS-level process termination | CLI exits immediately |
| Infinite loop / memory explosion | No exception thrown, just hangs/OOM | CLI freezes or gets killed by OS |
| Native addon segfault | C++ layer crash, JS can't intercept | Process dies instantly |
| `bash` executes `kill $$` | Kills own process at OS level | CLI exits |

**Note:** Normal third-party skills won't call `process.exit()`. The current protection is sufficient for daily use.

### MCP Server Isolation

MCP servers run as **separate child processes**, providing additional stability:

- If a MCP server crashes → Only that server's tools become unavailable, main CLI continues
- If main CLI crashes → MCP servers are automatically terminated by OS
- Memory leaks in MCP → Contained within that process, doesn't affect main CLI

### Best Practices for Skill Developers

When writing custom skills, follow these guidelines to ensure stability:

```javascript
// ✅ Good: Proper error handling
handler: async (args) => {
  try {
    const result = await someAsyncOperation();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ❌ Bad: Unhandled promise rejection
handler: async (args) => {
  setTimeout(() => {
    throw new Error('Background error'); // Will trigger unhandledRejection
  }, 100);
  return { ok: true };
}

// ❌ Bad: Process termination
handler: async (args) => {
  process.exit(1); // Kills the entire CLI!
}
```

### Debugging Crashes

If the CLI does crash unexpectedly:

1. **Check the error output** - Look for stack traces before the crash
2. **Run with verbose logging** - Add `DEBUG=*` environment variable
3. **Test skills in isolation** - Run skill handlers directly in Node REPL
4. **Check MCP server logs** - MCP stderr output is captured in agent logs

Example debugging command:
```bash
# Enable debug logging
export DEBUG=my-agent:*
npx tsx src/cli/agent-cli.ts
```

## How Two-Phase Skill Loading Saves Tokens

- **Traditional**: Inject all SKILL.md into System Prompt → 3 skills ≈ 1489 tokens per LLM call
- **This project**: System Prompt only contains skill index; full SKILL.md is returned as `activate_skill` tool result

| Skills | Traditional | This project | Saving |
|--------|------------|--------------|--------|
| 3      | 1489 tokens | 804 tokens   | 46% |
| 50     | 7658 tokens | 1179 tokens  | 84.6% |

## Tech Stack

- **Runtime**: Node.js 20+ / ESM modules
- **Language**: TypeScript 5.5
- **LLM Protocol**: OpenAI-compatible (function calling)
- **Interactive**: inquirer (REPL) + chalk (colored output)
- **Run without build**: tsx executes TypeScript directly

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | LLM API key | Required |
| `OPENAI_BASE_URL` | LLM API endpoint | `https://api.deepseek.com/v1` |
| `MODEL_NAME` | Model name | `deepseek-chat` |
| `SKILLS_DIR` | Custom skills directory | `<cwd>/skills` |

## License

ISC
