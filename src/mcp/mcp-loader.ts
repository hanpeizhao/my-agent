import * as fs from 'fs';
import * as path from 'path';
import { McpClient, McpTool, McpClientConfig } from './mcp-client.js';

/**
 * MCP 加载器
 *
 * 工作流程：
 * 1. 读取 .mcp.json 配置
 * 2. 为每个 server 启动子进程
 * 3. 握手并 listTools
 * 4. 把工具转换成 OpenAI function calling 格式
 * 5. 调用时通过 MCP Client 路由到对应 server
 *
 * MCP 工具命名规范：mcp__<server>__<tool>
 *   例如：mcp__filesystem__read_file
 *
 * 这样避免和内置工具、skill 工具冲突
 */

const MCP_PREFIX = 'mcp__';

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface LoadedServer {
  name: string;
  client: McpClient;
  tools: McpTool[];
}

export class McpLoader {
  private servers: Map<string, LoadedServer> = new Map();
  private configPath: string | null = null;

  /**
   * 从配置文件加载所有 MCP Server
   */
  async loadFromConfig(configPath: string): Promise<void> {
    this.configPath = configPath;
    if (!fs.existsSync(configPath)) {
      console.log(`[McpLoader] No .mcp.json found at ${configPath}`);
      return;
    }

    let config: any;
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch (error: any) {
      console.error(`[McpLoader] Failed to parse ${configPath}:`, error.message);
      return;
    }

    const mcpServers = config.mcpServers || {};
    const serverNames = Object.keys(mcpServers).filter(n => !n.startsWith('_'));

    if (serverNames.length === 0) {
      console.log('[McpLoader] No MCP servers configured');
      return;
    }

    console.log(`[McpLoader] Loading ${serverNames.length} MCP server(s): ${serverNames.join(', ')}`);

    for (const name of serverNames) {
      const serverConfig: McpServerConfig = mcpServers[name];
      await this.loadServer(name, serverConfig);
    }

    console.log(`[McpLoader] ✓ Loaded ${this.getTotalToolCount()} MCP tools across ${this.servers.size} servers`);
  }

  /**
   * 加载单个 MCP Server
   */
  private async loadServer(name: string, config: McpServerConfig): Promise<void> {
    const clientConfig: McpClientConfig = {
      name,
      command: config.command,
      args: config.args,
      env: config.env
    };

    const client = new McpClient(clientConfig);

    try {
      await client.connect();
    } catch (error: any) {
      console.warn(`[McpLoader] Failed to connect ${name}: ${error.message}`);
      return;
    }

    try {
      const tools = await client.listTools();
      this.servers.set(name, { name, client, tools });
      const toolNames = tools.map(t => t.name).join(', ');
      console.log(`[McpLoader] ✓ ${name}: ${tools.length} tools (${toolNames})`);
    } catch (error: any) {
      console.warn(`[McpLoader] Failed to list tools for ${name}: ${error.message}`);
      await client.disconnect();
    }
  }

  /**
   * 获取所有 MCP 工具（OpenAI function calling 格式）
   *
   * 命名规范：mcp__<server>__<tool>
   * 这样 LLM 调用时可以正确路由
   */
  getAllToolDefinitions(): any[] {
    const definitions: any[] = [];

    for (const [serverName, server] of this.servers) {
      for (const tool of server.tools) {
        const mcpName = `${MCP_PREFIX}${serverName}__${tool.name}`;
        definitions.push({
          type: 'function',
          function: {
            name: mcpName,
            description: `[MCP:${serverName}] ${tool.description}`,
            parameters: tool.inputSchema || {
              type: 'object',
              properties: {}
            }
          }
        });
      }
    }

    return definitions;
  }

  /**
   * 执行 MCP 工具
   * 输入：完整的工具名（mcp__<server>__<tool>）
   */
  async executeTool(fullName: string, args: any): Promise<{ content: string; isError: boolean } | null> {
    // 解析 mcp__<server>__<tool>
    if (!fullName.startsWith(MCP_PREFIX)) {
      return null;
    }

    const parts = fullName.slice(MCP_PREFIX.length).split('__');
    if (parts.length < 2) {
      return null;
    }

    const serverName = parts[0];
    const toolName = parts.slice(1).join('__');  // 工具名本身可能含 __

    const server = this.servers.get(serverName);
    if (!server) {
      return {
        content: JSON.stringify({ error: `MCP server "${serverName}" not found` }),
        isError: true
      };
    }

    try {
      const result = await server.client.callTool(toolName, args);

      // MCP 结果可能是 text / image，提取文本
      const textParts = result.content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text);
      const text = textParts.join('\n');

      return {
        content: text || JSON.stringify(result.content),
        isError: result.isError || false
      };
    } catch (error: any) {
      return {
        content: JSON.stringify({ error: error.message }),
        isError: true
      };
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { serverCount: number; toolCount: number; servers: Array<{ name: string; toolCount: number }> } {
    const servers = Array.from(this.servers.values()).map(s => ({
      name: s.name,
      toolCount: s.tools.length
    }));

    return {
      serverCount: this.servers.size,
      toolCount: this.getTotalToolCount(),
      servers
    };
  }

  private getTotalToolCount(): number {
    let count = 0;
    for (const server of this.servers.values()) {
      count += server.tools.length;
    }
    return count;
  }

  /**
   * 关闭所有 MCP Server
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    for (const server of this.servers.values()) {
      disconnectPromises.push(server.client.disconnect());
    }
    await Promise.all(disconnectPromises);
    this.servers.clear();
  }

  // ── 配置文件操作（不涉及实际加载） ─────────────────────

  /**
   * 列出 .mcp.json 中配置的所有 server（含未加载的）
   */
  listConfiguredServers(): Array<{ name: string; command: string; args: string[]; env: Record<string, string> }> {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      return [];
    }
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      const servers = config.mcpServers || {};
      return Object.keys(servers)
        .filter(name => !name.startsWith('_'))
        .map(name => ({
          name,
          command: servers[name].command,
          args: servers[name].args || [],
          env: servers[name].env || {}
        }));
    } catch {
      return [];
    }
  }

  /**
   * 添加 server 到 .mcp.json
   * 如果已存在则覆盖
   */
  addServer(name: string, command: string, args: string[], env: Record<string, string>): { success: boolean; message: string } {
    if (!this.configPath) {
      return { success: false, message: 'No config path set' };
    }

    // 读现有配置
    let config: any = { mcpServers: {} };
    if (fs.existsSync(this.configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        if (!config.mcpServers) config.mcpServers = {};
      } catch {
        config = { mcpServers: {} };
      }
    }

    // 检查是否已存在
    const existed = !!config.mcpServers[name];

    // 写入
    config.mcpServers[name] = {
      command,
      args,
      ...(Object.keys(env).length > 0 ? { env } : {})
    };

    // 保存
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

    return {
      success: true,
      message: existed
        ? `Server "${name}" updated in ${this.configPath}`
        : `Server "${name}" added to ${this.configPath}`
    };
  }

  /**
   * 从 .mcp.json 删除 server
   */
  removeServer(name: string): { success: boolean; message: string } {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      return { success: false, message: 'No .mcp.json found' };
    }

    let config: any;
    try {
      config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return { success: false, message: 'Invalid .mcp.json' };
    }

    if (!config.mcpServers || !config.mcpServers[name]) {
      return { success: false, message: `Server "${name}" not found in .mcp.json` };
    }

    delete config.mcpServers[name];
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

    return { success: true, message: `Server "${name}" removed from .mcp.json` };
  }
}
