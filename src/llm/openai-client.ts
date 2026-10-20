import { Message, ToolDefinition, LlmResponse, LlmClient, StreamCallbacks, ToolCall } from '../core/types.js';
import OpenAI from 'openai';

/**
 * OpenAI LLM 客户端配置
 */
export interface OpenAiClientConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

/**
 * OpenAI LLM 客户端实现 - 同时支持非流式和流式
 */
export class OpenAiLlmClient implements LlmClient {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAiClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    this.model = config.model || 'gpt-4o';
  }

  /**
   * 非流式调用（保持向后兼容）
   */
  async chat(messages: Message[], tools: ToolDefinition[]): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages as any,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls?.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments
      }
    }));

    return {
      content: choice.message.content || '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  /**
   * 流式调用 - 实时接收 LLM 生成的内容
   */
  async streamChat(
    messages: Message[],
    tools: ToolDefinition[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,  // ✅ 开启流式
      });

      let fullContent = '';
      const toolCallAccumulators = new Map<number, {
        id: string;
        name: string;
        arguments: string;
      }>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // 处理文本增量
        if (delta.content) {
          fullContent += delta.content;
          callbacks.onDelta?.(delta.content);
        }

        // 处理推理/思考过程（DeepSeek R1、Claude 等支持）
        if ((delta as any).reasoning_content) {
          callbacks.onReasoning?.((delta as any).reasoning_content);
        }

        // 处理工具调用（流式累积）
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;

            if (!toolCallAccumulators.has(index)) {
              // 新的工具调用
              toolCallAccumulators.set(index, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || ''
              });
            } else {
              // 累积到现有工具调用
              const acc = toolCallAccumulators.get(index)!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            }
          }
        }
      }

      // 流结束后，触发所有完整的工具调用
      for (const acc of toolCallAccumulators.values()) {
        const toolCall: ToolCall = {
          id: acc.id,
          type: 'function',
          function: {
            name: acc.name,
            arguments: acc.arguments
          }
        };
        callbacks.onToolCall?.(toolCall);
      }

      // 完成回调
      const finalToolCalls = Array.from(toolCallAccumulators.values()).map(acc => ({
        id: acc.id,
        type: 'function' as const,
        function: {
          name: acc.name,
          arguments: acc.arguments
        }
      }));

      callbacks.onComplete?.({
        content: fullContent,
        toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined
      });

    } catch (error: any) {
      callbacks.onError?.(error);
      throw error;
    }
  }
}
