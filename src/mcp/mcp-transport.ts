import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';

/**
 * MCP 传输层抽象
 *
 * MCP 协议支持两种传输：
 * 1. stdio：通过子进程的 stdin/stdout 通信（本地 MCP Server）
 * 2. SSE：通过 HTTP Server-Sent Events 通信（远程 MCP Server）
 *
 * 这里只实现 stdio，因为绝大多数 MCP Server 都用 stdio
 */

export interface McpTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: string): void;
  onMessage(handler: (message: string) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}

/**
 * stdio 传输 - 通过子进程通信
 */
export class StdioTransport implements McpTransport {
  private process: ChildProcess | null = null;
  private messageHandler: ((message: string) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private buffer: string = '';

  constructor(
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {}
  ) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Windows 上 spawn 找不到 npx，需要 shell: true
        // 这样 command 可以是 'npx' / 'node' / 'python' 等
        const isWindows = process.platform === 'win32';
        this.process = spawn(this.command, this.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.env },
          shell: isWindows  // Windows 下用 shell 模式
        });

        this.process.on('error', (err) => {
          this.errorHandler?.(err);
          reject(err);
        });

        this.process.on('close', () => {
          this.closeHandler?.();
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.buffer += data.toString();
          this.processBuffer();
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          // stderr 只用于调试日志，不影响协议
          const text = data.toString().trim();
          if (text) {
            console.log(`[MCP stderr] ${text}`);
          }
        });

        // 等待进程启动
        setTimeout(() => resolve(), 100);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  send(message: string): void {
    if (!this.process?.stdin) {
      throw new Error('Process not started or stdin not available');
    }
    // MCP 协议：消息以换行符分隔
    this.process.stdin.write(message + '\n');
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /**
   * 处理缓冲区：MCP 消息以换行符分隔
   */
  private processBuffer(): void {
    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;

      const message = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (message && this.messageHandler) {
        this.messageHandler(message);
      }
    }
  }
}
