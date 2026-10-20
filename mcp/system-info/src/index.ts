#!/usr/bin/env node
/**
 * System Info MCP Server - 纯手写实现
 *
 * 功能：
 * - 获取系统信息（OS、CPU、内存等）
 * - 文件统计工具（计算目录大小、文件数量）
 * - 大文件查找器（找出指定目录下的最大文件）
 * - 网络信息查询（IP地址、网络接口）
 */

import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// ==================== 工具实现 ====================

/**
 * 获取系统信息
 */
async function getSystemInfo(): Promise<any> {
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    hostname: os.hostname(),
    cpu: {
      model: os.cpus()[0]?.model || 'Unknown',
      cores: os.cpus().length,
      speed: os.cpus()[0]?.speed || 0
    },
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    },
    uptime: os.uptime(),
    userInfo: os.userInfo()
  };
}

/**
 * 统计目录信息
 */
async function directoryStats(directoryPath: string): Promise<any> {
  const resolvedPath = path.resolve(directoryPath);

  let totalSize = 0;
  let fileCount = 0;
  let dirCount = 0;
  const extensions: Record<string, number> = {};

  async function traverse(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          dirCount++;
          await traverse(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;

          const ext = path.extname(entry.name).toLowerCase() || '(no extension)';
          extensions[ext] = (extensions[ext] || 0) + 1;
        }
      }
    } catch (error) {
      // 忽略权限错误
    }
  }

  await traverse(resolvedPath);

  return {
    path: resolvedPath,
    size: totalSize,
    fileCount,
    directoryCount: dirCount,
    extensions: Object.entries(extensions)
      .map(([ext, count]) => ({ extension: ext, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  };
}

/**
 * 查找大文件
 */
async function findLargeFiles(directoryPath: string, limit: number = 10): Promise<any[]> {
  const resolvedPath = path.resolve(directoryPath);
  const files: Array<{ path: string; size: number }> = [];

  async function traverse(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({ path: fullPath, size: stats.size });
        }
      }
    } catch (error) {
      // 忽略权限错误
    }
  }

  await traverse(resolvedPath);

  return files
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)
    .map(f => ({
      path: f.path,
      size: f.size,
      sizeHuman: formatBytes(f.size)
    }));
}

/**
 * 获取网络信息
 */
async function getNetworkInfo(): Promise<any> {
  const interfaces = os.networkInterfaces();

  return {
    interfaces: Object.entries(interfaces).map(([name, addrs]) => ({
      name,
      addresses: addrs?.map(addr => ({
        address: addr.address,
        family: addr.family,
        internal: addr.internal
      }))
    })),
    publicIp: await getPublicIp()
  };
}

/**
 * 获取公网 IP
 */
function getPublicIp(): Promise<string> {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.ip);
        } catch {
          resolve('Unable to fetch');
        }
      });
    }).on('error', () => resolve('Unable to fetch'));
  });
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ==================== MCP 协议处理 ====================

/**
 * 定义所有工具
 */
const TOOLS = [
  {
    name: 'get_system_info',
    description: '获取当前系统的详细信息，包括操作系统、CPU、内存、网络等',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'directory_stats',
    description: '统计指定目录的信息，包括文件大小、文件数量、扩展名分布等',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要统计的目录路径'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'find_large_files',
    description: '在指定目录中查找最大的文件',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要搜索的目录路径'
        },
        limit: {
          type: 'number',
          description: '返回的文件数量限制（默认10）'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'get_network_info',
    description: '获取网络信息，包括本地网络接口和公网IP地址',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

/**
 * 处理工具调用
 */
async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'get_system_info':
      return await getSystemInfo();

    case 'directory_stats':
      return await directoryStats(args.path);

    case 'find_large_files':
      return await findLargeFiles(args.path, args.limit || 10);

    case 'get_network_info':
      return await getNetworkInfo();

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * 处理 JSON-RPC 请求
 */
async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'system-info-mcp',
              version: '1.0.0'
            }
          }
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS }
        };

      case 'tools/call':
        const result = await handleToolCall(params.name, params.arguments || {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// ==================== 主程序 ====================

/**
 * 从 stdin 读取并处理 JSON-RPC 消息
 */
async function main() {
  process.stderr.write('[system-info-mcp] Server started\n');

  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;

    // 按行分割（JSON-RPC over stdio 使用换行分隔）
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留最后一行（可能不完整）

    for (const line of lines) {
      if (line.trim()) {
        try {
          const request = JSON.parse(line) as JsonRpcRequest;
          const response = await handleRequest(request);

          // 发送响应到 stdout
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (error) {
          process.stderr.write(`[system-info-mcp] Parse error: ${error}\n`);
        }
      }
    }
  });

  process.stdin.on('end', () => {
    process.stderr.write('[system-info-mcp] Connection closed\n');
    process.exit(0);
  });
}

main().catch(error => {
  process.stderr.write(`[system-info-mcp] Fatal error: ${error}\n`);
  process.exit(1);
});
