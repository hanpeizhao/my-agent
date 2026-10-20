/**
 * 核心类型定义
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export type ToolHandler = (args: any) => Promise<any> | any;

export interface ToolGroup {
  groupName: string;
  description: string;
  tools: Array<{
    definition: ToolDefinition;
    handler: ToolHandler;
  }>;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LlmResponse {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * 流式回调接口 - 用于接收 LLM 的实时输出
 */
export interface StreamCallbacks {
  /**
   * 文本增量（每次收到几个 token）
   */
  onDelta?: (delta: string) => void;

  /**
   * 思考过程增量（仅当 LLM 支持 reasoning/thinking 时触发）
   */
  onReasoning?: (reasoning: string) => void;

  /**
   * 工具调用完成（累积完整后触发）
   */
  onToolCall?: (toolCall: ToolCall) => void;

  /**
   * 流式完成（所有 token 接收完毕）
   */
  onComplete?: (response: LlmResponse) => void;

  /**
   * 发生错误
   */
  onError?: (error: Error) => void;
}

export interface LlmClient {
  chat(messages: Message[], tools: ToolDefinition[]): Promise<LlmResponse>;
  streamChat?(
    messages: Message[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks
  ): Promise<void>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * Agent 事件类型
 */
export type AgentPhase = 'THINKING' | 'TOOL_CALLING' | 'TOOL_EXECUTING' | 'IDLE';

export interface AgentEvent {
  phase: AgentPhase;
  iteration: number;
  textDelta?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export type AgentEventCallback = (event: AgentEvent) => void;

export interface AgentLoopConfig {
  maxIterations: number;
  systemPrompt: string;
}

/**
 * 插件 Manifest
 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  tools: string[];
  entry: string;
}

export interface PluginInfo {
  manifest: PluginManifest;
  path: string;
  activated: boolean;
  tools?: ToolGroup;
}

/**
 * 会话数据
 */
export interface SessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

/**
 * 配置
 */
export interface AgentConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  maxIterations: number;
  pluginsDir: string;
  sessionsDir: string;
}
