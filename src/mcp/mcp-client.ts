import { StdioTransport, McpTransport } from './mcp-transport.js';

/**
 * MCP Client - 实现 JSON-RPC 2.0 协议
 *
 * 协议规范：https://spec.modelcontextprotocol.io/
 *
 * 核心交互：
 * 1. initialize - 握手，交换能力
 * 2. tools/list - 列出所有工具
 * 3. tools/call - 调用工具
 * 4. resources/list - 列出资源
 * 5. prompts/list - 列出提示模板
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{
    type: string;        // 'text' / 'image' / ...
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface McpClientConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export class McpClient {
  private transport: McpTransport;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private config: McpClientConfig;
  private connected = false;

  constructor(config: McpClientConfig) {
    this.config = config;
    this.transport = new StdioTransport(
      config.command,
      config.args || [],
      config.env || {}
    );
  }

  /**
   * 启动 MCP Server 并完成握手
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    console.log(`[MCP:${this.config.name}] Starting server...`);

    // 设置消息处理器
    this.transport.onMessage((message) => {
      this.handleMessage(message);
    });

    this.transport.onError((error) => {
      console.error(`[MCP:${this.config.name}] Error:`, error.message);
    });

    this.transport.onClose(() => {
      console.log(`[MCP:${this.config.name}] Connection closed`);
      this.connected = false;
      // 拒绝所有 pending 请求
      for (const [, req] of this.pendingRequests) {
        clearTimeout(req.timeout);
        req.reject(new Error('Connection closed'));
      }
      this.pendingRequests.clear();
    });

    // 启动传输
    await this.transport.start();

    // 握手：initialize
    try {
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'my-agent',
          version: '1.0.0'
        }
      });

      // 发送 initialized 通知（通知，不需要响应）
      this.sendNotification('notifications/initialized', {});

      this.connected = true;
      console.log(`[MCP:${this.config.name}] ✓ Connected`);
    } catch (error: any) {
      console.error(`[MCP:${this.config.name}] Handshake failed:`, error.message);
      await this.transport.stop();
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      this.connected = false;
      await this.transport.stop();
    }
  }

  /**
   * 列出所有工具
   */
  async listTools(): Promise<McpTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return (result.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }));
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: any): Promise<McpToolCallResult> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
    return {
      content: result.content || [],
      isError: result.isError
    };
  }

  /**
   * 列出资源（可选）
   */
  async listResources(): Promise<any[]> {
    const result = await this.sendRequest('resources/list', {});
    return result.resources || [];
  }

  /**
   * 列出提示模板（可选）
   */
  async listPrompts(): Promise<any[]> {
    const result = await this.sendRequest('prompts/list', {});
    return result.prompts || [];
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const message: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      // 30 秒超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method} (id=${id})`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      try {
        this.transport.send(JSON.stringify(message));
      } catch (error: any) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * 发送 JSON-RPC 通知（不需要响应）
   */
  private sendNotification(method: string, params: any): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params
    };
    try {
      this.transport.send(JSON.stringify(message));
    } catch (error: any) {
      console.error(`[MCP:${this.config.name}] Failed to send notification:`, error.message);
    }
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(message);
    } catch (error: any) {
      console.error(`[MCP:${this.config.name}] Invalid JSON:`, message);
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      // 可能是 server 主动发起的通知，忽略
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.config.name;
  }
}
