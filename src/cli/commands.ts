import chalk from 'chalk';
import { SessionManager } from '../core/session-manager';
import { SkillManager } from '../skills/skill-manager';
import { McpLoader } from '../mcp/mcp-loader';

export interface CommandContext {
  sessionManager: SessionManager;
  skillManager: SkillManager;
  mcpLoader: McpLoader;
  reloadMcp: () => Promise<void>;
  compactHistory?: boolean;
  windowSize?: number;
  exit: () => void;
}

export class CommandHandler {
  private commands: Map<string, (args: string[], ctx: CommandContext) => Promise<void>> = new Map();

  constructor() {
    this.registerBuiltinCommands();
  }

  private registerBuiltinCommands(): void {
    // /help
    this.commands.set('/help', async () => {
      console.log(chalk.cyan('\n=== my-agent CLI 帮助 ===\n'));
      console.log('可用命令：');
      console.log('  /help              - 显示此帮助信息');
      console.log('  /skills            - 列出所有可用 skill');
      console.log('  /mcp <subcommand>  - MCP 管理（list/add/remove/reload/help）');
      console.log('  /sessions          - 列出所有会话');
      console.log('  /new               - 开始新会话（清空当前上下文）');
      console.log('  /clear             - 清空当前对话上下文（保留 session）');
      console.log('  /compact           - 压缩对话历史（用摘要替换早期消息）');
      console.log('  /window [N]        - 设置滑动窗口大小（默认 10 条消息）');
      console.log('  /cls               - 清屏（不清上下文）');
      console.log('  /load <id>         - 加载指定会话');
      console.log('  /save [name]       - 保存当前会话');
      console.log('  /exit              - 退出程序');
      console.log('\n内置工具（直接可用，无需激活）：');
      console.log('  read_file, write_file, bash, search, activate_skill');
      console.log('  + MCP 工具（前缀 mcp__，启动时自动从 .mcp.json 加载）');
      console.log('\n提示：直接输入内容与 AI 对话\n');
    });

    // /skills
    this.commands.set('/skills', async (args, ctx) => {
      const skills = ctx.skillManager.getAllSkills();

      if (skills.length === 0) {
        console.log(chalk.yellow('\n暂无可用 skill\n'));
        return;
      }

      console.log(chalk.cyan('\n=== 可用 SKILL ===\n'));
      for (const skill of skills) {
        const status = skill.activated ? chalk.green('[已激活]') : chalk.gray('[未激活]');
        console.log(`${status} ${chalk.bold(skill.name)} (v${skill.version || '1.0.0'})`);
        console.log(`  ${skill.description}`);
        if (skill.trigger) {
          console.log(`  触发: ${skill.trigger}`);
        }
        console.log(`  工具: ${skill.toolSpecs.map(t => t.name).join(', ') || '(从 index.js 加载)'}`);
        console.log('');
      }
    });

    // /sessions
    this.commands.set('/sessions', async (args, ctx) => {
      const sessions = ctx.sessionManager.listSessions();

      if (sessions.length === 0) {
        console.log(chalk.yellow('\n暂无会话记录\n'));
        return;
      }

      console.log(chalk.cyan('\n=== 会话列表 ===\n'));
      for (const session of sessions) {
        const date = new Date(session.updatedAt).toLocaleString('zh-CN');
        const current = session.id === ctx.sessionManager.getCurrentSessionId()
          ? chalk.green(' [当前]')
          : '';
        console.log(`${chalk.bold(session.id)}${current}`);
        console.log(`  标题: ${session.title}`);
        console.log(`  更新: ${date}`);
        console.log(`  消息数: ${session.messageCount}`);
        console.log('');
      }
    });

    // /new
    this.commands.set('/new', async (args, ctx) => {
      ctx.sessionManager.createNewSession();
      console.log(chalk.green('\n已开始新会话\n'));
    });

    // /load
    this.commands.set('/load', async (args, ctx) => {
      if (args.length === 0) {
        console.log(chalk.red('\n请提供会话 ID\n'));
        return;
      }
      const sessionId = args[0];
      if (ctx.sessionManager.loadSession(sessionId)) {
        console.log(chalk.green(`\n已加载会话: ${sessionId}\n`));
      } else {
        console.log(chalk.red(`\n会话不存在: ${sessionId}\n`));
      }
    });

    // /save
    this.commands.set('/save', async (args, ctx) => {
      const title = args.length > 0 ? args.join(' ') : undefined;
      const sessionId = ctx.sessionManager.saveCurrentSession(title);
      console.log(chalk.green(`\n会话已保存: ${sessionId}\n`));
    });

    // /exit
    this.commands.set('/exit', async (args, ctx) => {
      console.log(chalk.cyan('\n再见！\n'));
      ctx.exit();
    });

    // /clear - 清空对话上下文
    this.commands.set('/clear', async (args, ctx) => {
      ctx.sessionManager.clearMessages();
      console.log(chalk.green('\n✓ 对话上下文已清空（session 文件保留，可用 /save 保存）\n'));
    });

    // /compact - 压缩对话历史（用摘要替换早期消息）
    this.commands.set('/compact', async (args, ctx) => {
      const messages = ctx.sessionManager.getMessages(99999);  // 获取全部
      const nonSystem = messages.filter(m => m.role !== 'system');

      if (nonSystem.length <= 6) {
        console.log(chalk.yellow('\n对话历史很短，不需要压缩\n'));
        return;
      }

      console.log(chalk.cyan('\n正在压缩对话历史...'));
      // 生成摘要的逻辑由 agent-cli 处理（需要 LLM 调用）
      // 这里只标记需要压缩，实际压缩在 agent-cli 中执行
      ctx.compactHistory = true;
      console.log(chalk.green('✓ 已标记压缩请求，下次对话时自动压缩\n'));
    });

    // /window - 设置滑动窗口大小
    this.commands.set('/window', async (args, ctx) => {
      if (args.length === 0) {
        console.log(chalk.cyan(`\n当前滑动窗口: ${ctx.windowSize || 10} 条消息\n`));
        return;
      }
      const size = parseInt(args[0], 10);
      if (isNaN(size) || size < 2) {
        console.log(chalk.red('\n窗口大小必须 ≥ 2\n'));
        return;
      }
      ctx.windowSize = size;
      console.log(chalk.green(`\n✓ 滑动窗口设置为 ${size} 条消息\n`));
    });

    // /cls - 只清屏
    this.commands.set('/cls', async () => {
      console.clear();
    });

    // /mcp - MCP 管理（简化版：只保留 list/add/remove/reload）
    this.commands.set('/mcp', async (args, ctx) => {
      const subcommand = (args[0] || 'list').toLowerCase();
      const subArgs = args.slice(1);

      switch (subcommand) {
        case 'list': {
          const configured = ctx.mcpLoader.listConfiguredServers();
          const loaded = ctx.mcpLoader.getStats();

          if (configured.length === 0) {
            console.log(chalk.yellow('\n.mcp.json 中没有配置任何 server\n'));
            console.log(chalk.gray('添加示例：'));
            console.log(chalk.gray('  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .\n'));
            return;
          }

          console.log(chalk.cyan('\n=== MCP Server 配置 ===\n'));
          for (const s of configured) {
            const loadedInfo = loaded.servers.find(ls => ls.name === s.name);
            const status = loadedInfo
              ? chalk.green(`[已加载 ${loadedInfo.toolCount} 工具]`)
              : chalk.red('[未加载]');

            console.log(`${status} ${chalk.bold(s.name)}`);
            console.log(`  command: ${s.command} ${(s.args || []).join(' ')}`);
            if (Object.keys(s.env || {}).length > 0) {
              const envKeys = Object.keys(s.env).map(k =>
                `${k}=${k.includes('TOKEN') || k.includes('KEY') ? '***' : s.env[k]}`
              ).join(', ');
              console.log(`  env: ${envKeys}`);
            }
            console.log('');
          }
          break;
        }

        case 'add': {
          // /mcp add <name> <command> [args...] [ENV_VAR=value...]
          // 特殊占位符 ./ 或 . 自动展开为当前工作目录
          if (subArgs.length < 2) {
            console.log(chalk.red('\n用法: /mcp add <name> <command> [args...] [ENV_VAR=value...]\n'));
            console.log(chalk.gray('示例:'));
            console.log(chalk.gray('  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .'));
            console.log(chalk.gray('  （. 会自动展开为当前工作目录）'));
            console.log(chalk.gray('  /mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=ghp_xxx\n'));
            return;
          }

          const name = subArgs[0];
          const command = subArgs[1];
          const rest = subArgs.slice(2);
          const cwd = process.cwd();

          // 分离 args 和 env：含 = 的当作 env
          // ./ 或 . 自动展开为当前工作目录
          const mcpArgs: string[] = [];
          const env: Record<string, string> = {};
          for (const item of rest) {
            const eqIdx = item.indexOf('=');
            if (eqIdx > 0 && !item.startsWith('-') && /^[A-Z_][A-Z0-9_]*$/.test(item.slice(0, eqIdx))) {
              env[item.slice(0, eqIdx)] = item.slice(eqIdx + 1);
            } else if (item === '.' || item === './') {
              // 占位符：当前工作目录
              mcpArgs.push(cwd);
            } else {
              mcpArgs.push(item);
            }
          }

          const result = ctx.mcpLoader.addServer(name, command, mcpArgs, env);
          if (result.success) {
            console.log(chalk.green(`\n✓ ${result.message}\n`));
            // 自动 reload 让新 server 立即生效
            console.log(chalk.cyan('正在加载新 server...\n'));
            await ctx.reloadMcp();
            const stats = ctx.mcpLoader.getStats();
            console.log(chalk.green(`✓ 当前共 ${stats.serverCount} 个 server，${stats.toolCount} 个工具\n`));
          } else {
            console.log(chalk.red(`\n✗ ${result.message}\n`));
          }
          break;
        }

        case 'remove':
        case 'rm': {
          if (subArgs.length === 0) {
            console.log(chalk.red('\n用法: /mcp remove <name>\n'));
            return;
          }
          const name = subArgs[0];
          const result = ctx.mcpLoader.removeServer(name);
          if (result.success) {
            console.log(chalk.green(`\n✓ ${result.message}\n`));
            // 自动 reload
            console.log(chalk.cyan('正在重新加载...\n'));
            await ctx.reloadMcp();
            const stats = ctx.mcpLoader.getStats();
            console.log(chalk.green(`✓ 当前共 ${stats.serverCount} 个 server，${stats.toolCount} 个工具\n`));
          } else {
            console.log(chalk.red(`\n✗ ${result.message}\n`));
          }
          break;
        }

        case 'reload': {
          console.log(chalk.cyan('\n正在重新加载所有 MCP server...\n'));
          await ctx.reloadMcp();
          const stats = ctx.mcpLoader.getStats();
          console.log(chalk.green(`\n✓ 已加载 ${stats.serverCount} 个 server，${stats.toolCount} 个工具\n`));
          break;
        }

        case 'help':
        default: {
          console.log(chalk.cyan('\n=== MCP 管理命令 ===\n'));
          console.log('  /mcp list                              - 列出所有已配置的 server');
          console.log('  /mcp add <name> <cmd> [args] [ENV=val] - 添加 server（自动加载）');
          console.log('  /mcp remove <name>                     - 删除 server（自动重载）');
          console.log('  /mcp reload                           - 重新加载所有 server');
          console.log('\n特殊占位符:');
          console.log('  . 或 ./  - 自动展开为当前工作目录');
          console.log('\n示例:');
          console.log('  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem@1.0.0 .');
          console.log('  /mcp add github npx -y @modelcontextprotocol/server-github GITHUB_TOKEN=ghp_xxx');
          console.log('  /mcp remove github');
          console.log('\n配置文件: .mcp.json（项目根目录）\n');
          break;
        }
      }
    });
  }

  async execute(input: string, ctx: CommandContext): Promise<boolean> {
    if (!input.startsWith('/')) return false;

    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (!handler) {
      console.log(chalk.red(`\n未知命令: ${command}`));
      console.log('输入 /help 查看可用命令\n');
      return true;
    }

    try {
      await handler(args, ctx);
    } catch (error: any) {
      console.error(chalk.red('\n命令执行失败:'), error?.message || error);
    }
    return true;
  }
}
