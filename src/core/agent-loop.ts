import { LlmClient, Message, ToolCall, ToolResult, StreamCallbacks } from './types';
import { SkillManager } from '../skills/skill-manager';
import { McpLoader } from '../mcp/mcp-loader';
import {
  createBuiltinTools,
  executeBuiltinTool,
  getBuiltinToolDefinitions,
  BuiltinTool,
  BuiltinToolContext
} from '../builtin/builtin-tools';

interface AgentLoopConfig {
  llmClient: LlmClient;
  skillManager: SkillManager;
  mcpLoader?: McpLoader;
  systemPrompt: string;
  maxIterations?: number;
  workingDir?: string;
}

export class AgentLoop {
  private llmClient: LlmClient;
  private skillManager: SkillManager;
  private mcpLoader: McpLoader | null;
  private systemPrompt: string;
  private maxIterations: number;
  private workingDir: string;
  private builtinTools: BuiltinTool[];
  private builtinContext: BuiltinToolContext;

  constructor(config: AgentLoopConfig) {
    this.llmClient = config.llmClient;
    this.skillManager = config.skillManager;
    this.mcpLoader = config.mcpLoader || null;
    this.systemPrompt = config.systemPrompt;
    this.maxIterations = config.maxIterations || 15;
    this.workingDir = config.workingDir || process.cwd();

    // 初始化内置工具
    this.builtinContext = {
      skillManager: this.skillManager,
      workingDir: this.workingDir
    };
    this.builtinTools = createBuiltinTools(this.builtinContext);
  }

  /**
   * 获取当前所有可用工具：
   * - 内置工具（always on）
   * - 已激活 skill 的工具
   * - MCP Server 的工具（命名前缀 mcp__）
   */
  private getActiveTools(): any[] {
    const builtinDefs = getBuiltinToolDefinitions(this.builtinTools);
    const skillDefs = this.skillManager.getActivatedToolDefinitions();
    const mcpDefs = this.mcpLoader?.getAllToolDefinitions() || [];
    return [...builtinDefs, ...skillDefs, ...mcpDefs];
  }

  /**
   * 运行 Agent 循环
   * @param messages 消息历史
   * @param callbacks 可选的流式回调（如果提供且 LLM 支持，则使用流式输出）
   */
  async run(messages: Message[], callbacks?: StreamCallbacks): Promise<string> {
    // Add system prompt
    const messagesWithSystem: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...messages
    ];

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const activeTools = this.getActiveTools();
      const mcpCount = this.mcpLoader?.getStats().toolCount || 0;
      console.log(`\n[AgentLoop] Iteration ${iteration + 1}, tools: ${activeTools.length} (builtin: ${this.builtinTools.length}, skills: ${activeTools.length - this.builtinTools.length - mcpCount}, mcp: ${mcpCount})`);

      let response;

      // 根据是否提供 callbacks 和 LLM 是否支持流式来决定调用方式
      if (callbacks && this.llmClient.streamChat) {
        // ✅ 使用流式调用
        response = await this.callLlmStreaming(messagesWithSystem, activeTools, callbacks);
      } else {
        // ✅ 使用非流式调用（向后兼容）
        response = await this.llmClient.chat(messagesWithSystem, activeTools);
      }

      // No tool calls - return final response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        console.log('[AgentLoop] No tool calls, returning final response');
        return response.content;
      }

      // Add assistant message
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls
      };
      messagesWithSystem.push(assistantMessage);

      // Process each tool call
      for (const toolCall of response.toolCalls) {
        console.log(`[AgentLoop] Tool call: ${toolCall.function.name}`);

        const toolResult = await this.executeToolCall(toolCall);

        const resultMessage: Message = {
          role: 'tool',
          content: toolResult.content,
          tool_call_id: toolCall.id
        };
        messagesWithSystem.push(resultMessage);
      }
    }

    return `⚠️ 已达到最大迭代次数（${this.maxIterations}），任务未完成。

可能的原因：
1. 任务过于复杂，建议拆分为多个小任务
2. 需要更多上下文信息
3. 某些工具调用可能遇到了问题

你可以：
- 重新描述需求，提供更具体的指令
- 使用 /clear 清空对话历史后重试
- 检查相关 skill 或 MCP server 是否正常工作`;
  }

  /**
   * 流式调用 LLM，并实时触发回调
   */
  private async callLlmStreaming(
    messages: Message[],
    tools: any[],
    callbacks: StreamCallbacks
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    return new Promise((resolve, reject) => {
      let finalContent = '';
      const finalToolCalls: ToolCall[] = [];

      this.llmClient.streamChat!(messages, tools, {
        onDelta: (delta) => {
          finalContent += delta;
          callbacks.onDelta?.(delta);
        },
        onReasoning: (reasoning) => {
          callbacks.onReasoning?.(reasoning);
        },
        onToolCall: (toolCall) => {
          finalToolCalls.push(toolCall);
          callbacks.onToolCall?.(toolCall);
        },
        onComplete: () => {
          resolve({
            content: finalContent,
            toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined
          });
        },
        onError: (error) => {
          callbacks.onError?.(error);
          reject(error);
        }
      }).catch(reject);
    });
  }

  /**
   * 执行工具调用：
   * 1. MCP 工具（命名前缀 mcp__）
   * 2. 内置工具
   * 3. 已激活的 skill 工具
   */
  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    let args: any = {};

    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch {
      args = {};
    }

    // 1. MCP 工具（前缀 mcp__）
    if (toolName.startsWith('mcp__') && this.mcpLoader) {
      const mcpResult = await this.mcpLoader.executeTool(toolName, args);
      if (mcpResult) {
        console.log(`[AgentLoop] ✓ Executed via MCP: ${toolName}`);
        return mcpResult;
      }
    }

    // 2. 尝试内置工具
    const builtinResult = await executeBuiltinTool(
      this.builtinTools,
      toolName,
      args,
      this.builtinContext
    );

    if (builtinResult) {
      console.log(`[AgentLoop] ✓ Executed via builtin: ${toolName}`);
      return builtinResult;
    }

    // 3. 尝试已激活的 skill 工具
    const skillResult = await this.skillManager.executeTool(toolName, args);

    if (skillResult) {
      console.log(`[AgentLoop] ✓ Executed via skill: ${toolName}`);
      return skillResult;
    }

    // 4. 工具不存在
    console.log(`[AgentLoop] ✗ Tool not found: ${toolName}`);
    return {
      content: JSON.stringify({
        error: `Tool "${toolName}" not found. Available channels: builtin (read_file, write_file, bash, search, activate_skill), activated skills, MCP servers (mcp__ prefix).`
      }),
      isError: true
    };
  }
}
