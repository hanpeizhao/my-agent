import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { CommandHandler, CommandContext } from './commands';
import { SessionManager } from '../core/session-manager';
import { SkillManager } from '../skills/skill-manager';
import { AgentLoop } from '../core/agent-loop';
import { OpenAiLlmClient } from '../llm/openai-client';
import { McpLoader } from '../mcp/mcp-loader';
import { buildSystemPrompt, buildSkillIndex, buildMcpIndex } from '../prompt/builder';
import { Message } from '../core/types';

class AgentCLI {
  private commandHandler: CommandHandler;
  private sessionManager: SessionManager;
  private skillManager: SkillManager;
  private mcpLoader: McpLoader;
  private apiKey: string;
  private llmClient: OpenAiLlmClient;
  private systemPrompt: string;
  private agentLoop: AgentLoop | null = null;
  private windowSize: number = 10;
  private compactRequested: boolean = false;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const configDir = `${homeDir}/.my-agent`;
    const projectRoot = process.cwd();

    this.sessionManager = new SessionManager(`${configDir}/sessions`);

    const skillsDir = process.env.SKILLS_DIR || `${projectRoot}/skills`;
    this.skillManager = new SkillManager(skillsDir);
    this.mcpLoader = new McpLoader();
    this.commandHandler = new CommandHandler();
    this.sessionManager.createNewSession();

    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.llmClient = new OpenAiLlmClient({
      apiKey: this.apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.MODEL_NAME || 'deepseek-chat'
    });
    this.systemPrompt = '';
  }

  async start(): Promise<void> {
    console.log(chalk.cyan.bold('\n╔══════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║       🤖 my-agent CLI            ║'));
    console.log(chalk.cyan.bold('╚══════════════════════════════════╝\n'));

    if (!this.apiKey) {
      console.log(chalk.red('✗ OPENAI_API_KEY not set'));
      console.log(chalk.yellow('  Set it via: export OPENAI_API_KEY="your-key"\n'));
    } else {
      console.log(chalk.green('✓ API Key configured'));
    }

    const skills = this.skillManager.getAllSkills();
    console.log(chalk.green(`✓ Loaded ${skills.length} skill(s): ${skills.map(s => s.name).join(', ')}`));
    console.log(chalk.green('✓ 5 builtin tools: activate_skill, read_file, write_file, bash, search'));

    // 自动加载 .mcp.json（存在就加载，不存在就跳过）
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
    await this.mcpLoader.loadFromConfig(mcpConfigPath);
    const mcpStats = this.mcpLoader.getStats();
    if (mcpStats.serverCount > 0) {
      console.log(chalk.green(`✓ MCP loaded: ${mcpStats.serverCount} server(s), ${mcpStats.toolCount} tools`));
    } else {
      console.log(chalk.gray('○ MCP: no .mcp.json or no servers configured'));
    }

    await this.initAgentLoop();

    console.log(chalk.green('\n✓ Agent initialized'));
    console.log(chalk.gray('  Type /help for commands, or just start chatting\n'));

    await this.mainLoop();
  }

  private async initAgentLoop(): Promise<void> {
    const skills = this.skillManager.getAllSkills();
    const skillIndex = buildSkillIndex(this.skillManager);
    const mcpIndex = buildMcpIndex(this.mcpLoader);
    const basePrompt = buildSystemPrompt(skillIndex, skills.length, mcpIndex);

    // 可选：AGENTS.md 注入
    const agentsMdPath = path.join(process.cwd(), 'AGENTS.md');
    let systemPrompt = basePrompt;
    if (fs.existsSync(agentsMdPath)) {
      systemPrompt = `${basePrompt}\n\n${fs.readFileSync(agentsMdPath, 'utf-8')}`;
    }
    this.systemPrompt = systemPrompt;

    this.agentLoop = new AgentLoop({
      llmClient: this.llmClient,
      skillManager: this.skillManager,
      mcpLoader: this.mcpLoader,
      systemPrompt,
      workingDir: process.cwd()
    });
  }

  /**
   * 重新加载 MCP（用于 /mcp add、/mcp remove、/mcp reload）
   */
  private async reloadMcp(): Promise<void> {
    // 先断开所有现有连接
    await this.mcpLoader.disconnectAll();
    // 重新加载配置
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
    await this.mcpLoader.loadFromConfig(mcpConfigPath);
    // 重新初始化 AgentLoop（更新 System Prompt）
    await this.initAgentLoop();
  }

  private async mainLoop(): Promise<void> {
    while (true) {
      let answer: string;
      try {
        const result = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: chalk.green('You'),
        }]);
        answer = (result.input || '').trim();
      } catch {
        console.log(chalk.cyan('\n再见！\n'));
        process.exit(0);
      }

      if (!answer) continue;

      if (answer.startsWith('/')) {
        if (answer.toLowerCase() === '/exit' || answer.toLowerCase() === '/quit') {
          console.log(chalk.cyan('\n再见！\n'));
          process.exit(0);
        }

        const ctx: CommandContext = {
          sessionManager: this.sessionManager,
          skillManager: this.skillManager,
          mcpLoader: this.mcpLoader,
          reloadMcp: async () => { await this.reloadMcp(); },
          windowSize: this.windowSize,
          compactHistory: this.compactRequested,
          exit: () => {
            console.log(chalk.cyan('\n再见！\n'));
            process.exit(0);
          }
        };

        // 处理 /window 命令的返回
        await this.commandHandler.execute(answer, ctx);
        if (ctx.windowSize) this.windowSize = ctx.windowSize;
        if (ctx.compactHistory) this.compactRequested = true;
        continue;
      }

      await this.handleUserMessage(answer);
    }
  }

  private async handleUserMessage(message: string): Promise<void> {
    if (!this.agentLoop) {
      console.error(chalk.red('Agent not initialized'));
      return;
    }

    // 处理 /compact 请求
    if (this.compactRequested) {
      await this.doCompact();
      this.compactRequested = false;
    }

    const userMsg: Message = { role: 'user', content: message };
    this.sessionManager.addMessage(userMsg);

    try {
      // 使用滑动窗口获取消息（token 优化）
      const messages = this.sessionManager.getMessages(this.windowSize);
      const totalMessages = this.sessionManager.getAllMessages().length;
      console.log(chalk.gray(`\n[DEBUG] Sending ${messages.length}/${totalMessages} messages to LLM (window=${this.windowSize})`));

      // ✅ 流式输出：实时显示 LLM 的思考过程和回复
      let fullResponse = '';
      let isThinking = false;

      const response = await this.agentLoop.run(messages, {
        // 流式接收思考过程（如果模型支持）
        onReasoning: (reasoning) => {
          if (!isThinking) {
            console.log(chalk.magenta('\n💭 Thinking:\n'));
            isThinking = true;
          }
          process.stdout.write(chalk.magenta(reasoning));
        },

        // 流式接收正式回复
        onDelta: (delta) => {
          if (isThinking) {
            console.log(chalk.cyan('\n\n🤖 Assistant:\n'));
            isThinking = false;
          } else if (fullResponse.length === 0) {
            console.log(chalk.cyan('\n🤖 Assistant:\n'));
          }
          process.stdout.write(chalk.white(delta));
          fullResponse += delta;
        },

        // 工具调用完成
        onToolCall: (toolCall) => {
          console.log(chalk.yellow(`\n🔧 Calling tool: ${toolCall.function.name}`));
        },

        // 流式完成
        onComplete: () => {
          console.log('\n');
        },

        // 错误处理
        onError: (error) => {
          console.error(chalk.red('\n❌ Streaming error:'), error.message);
        }
      });

      // 如果没有收到任何流式内容（降级到非流式），使用返回的完整响应
      if (fullResponse.length === 0) {
        console.log(chalk.cyan('\n🤖 Assistant:\n'));
        console.log(response);
        fullResponse = response;
      }

      this.sessionManager.addMessage({ role: 'assistant', content: fullResponse });
    } catch (error: any) {
      console.error(chalk.red('\n❌ Error:'));
      console.error(chalk.red(error?.message || String(error)));
      if (error?.stack) console.error(chalk.gray(error.stack));
      console.log('');
    }
  }

  /**
   * 压缩对话历史：用 LLM 生成摘要替换早期消息
   */
  private async doCompact(): Promise<void> {
    const allMessages = this.sessionManager.getAllMessages();
    const nonSystem = allMessages.filter(m => m.role !== 'system');

    if (nonSystem.length <= 6) {
      console.log(chalk.yellow('对话太短，不需要压缩'));
      return;
    }

    console.log(chalk.cyan('正在生成对话摘要...'));

    // 准备压缩请求
    const earlyMessages = nonSystem.slice(0, -6);  // 早期消息（要压缩的）
    const summaryRequest: Message[] = [
      ...allMessages.filter(m => m.role === 'system'),
      {
        role: 'user',
        content: `请把以下对话总结成一段简洁的摘要（200字以内），保留关键信息：用户意图、已完成的操作、重要结论。\n\n${earlyMessages.map(m => `[${m.role}] ${m.content?.slice(0, 200)}`).join('\n')}`
      }
    ];

    try {
      const response = await this.llmClient.chat(summaryRequest, []);
      this.sessionManager.compactMessages(response.content);
      console.log(chalk.green('✓ 对话历史已压缩\n'));
    } catch (error: any) {
      console.error(chalk.red(`压缩失败: ${error.message}`));
    }
  }
}

const cli = new AgentCLI();

// ══════════════════════════════════════════════════════════════
// 全局异常保护：防止 skill 的致命错误杀死整个 CLI 进程
// ══════════════════════════════════════════════════════════════

// 1. 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.yellow('\n⚠️  [Warning] Unhandled Promise Rejection:'));
  console.error(chalk.gray(String(reason)));
  // 不退出进程，只警告
});

// 2. 捕获未捕获的同步异常
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n❌ [Fatal] Uncaught Exception:'));
  console.error(chalk.red(error.message));
  if (error.stack) console.error(chalk.gray(error.stack));
  console.log(chalk.yellow('继续运行...\n'));
  // 不退出进程
});

// 3. 防止 SIGTERM/SIGINT 意外终止（Ctrl+C 除外）
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n收到 SIGTERM 信号，优雅退出...'));
  process.exit(0);
});

cli.start().catch((error: any) => {
  console.error(chalk.red('Fatal error:'), error?.message || error);
  process.exit(1);
});
