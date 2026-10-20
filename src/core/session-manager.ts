import * as fs from 'fs';
import * as path from 'path';
import { Message, SessionData } from './types';

export class SessionManager {
  private sessionsDir: string;
  private currentSessionId: string | null = null;
  private currentMessages: Message[] = [];

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  createNewSession(): void {
    this.currentSessionId = `session-${Date.now()}`;
    this.currentMessages = [];
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  addMessage(message: Message): void {
    this.currentMessages.push(message);
  }

  /**
   * 获取对话历史（带滑动窗口优化）
   *
   * 策略：
   * - 消息数 ≤ maxMessages 时：全量返回
   * - 消息数 > maxMessages 时：只保留最近 maxMessages 条
   * - System 消息永远保留（不算入窗口）
   *
   * 默认 maxMessages = 10（约 5 轮对话）
   */
  getMessages(maxMessages: number = 10): Message[] {
    const all = this.currentMessages;

    // 分离 system 消息和普通消息
    const systemMessages = all.filter(m => m.role === 'system');
    const nonSystemMessages = all.filter(m => m.role !== 'system');

    // 不超限，全量返回
    if (nonSystemMessages.length <= maxMessages) {
      return [...all];
    }

    // 超限，只保留最近 maxMessages 条 + system
    const recentMessages = nonSystemMessages.slice(-maxMessages);
    console.log(`[SessionManager] Sliding window: ${nonSystemMessages.length} → ${recentMessages.length} messages (dropped ${nonSystemMessages.length - recentMessages.length} early messages)`);
    return [...systemMessages, ...recentMessages];
  }

  /**
   * 获取全部消息（不带滑动窗口，用于保存）
   */
  getAllMessages(): Message[] {
    return [...this.currentMessages];
  }

  clearMessages(): void {
    this.currentMessages = [];
  }

  /**
   * 压缩对话历史（用摘要替换早期消息）
   * 由 /compact 命令调用
   */
  compactMessages(summary: string): void {
    const systemMessages = this.currentMessages.filter(m => m.role === 'system');
    const summaryMessage: Message = {
      role: 'system',
      content: `[之前的对话摘要]\n${summary}`
    };
    // 保留最近 6 条消息（3 轮对话）+ 摘要
    const recent = this.currentMessages.filter(m => m.role !== 'system').slice(-6);
    this.currentMessages = [...systemMessages, summaryMessage, ...recent];
  }

  saveCurrentSession(title?: string): string | null {
    if (!this.currentSessionId || this.currentMessages.length === 0) {
      return null;
    }

    const sessionData: SessionData = {
      id: this.currentSessionId,
      title: title || this.generateTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: this.currentMessages
    };

    const filePath = path.join(this.sessionsDir, `${this.currentSessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

    return this.currentSessionId;
  }

  loadSession(sessionId: string): boolean {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const sessionData: SessionData = JSON.parse(content);
      this.currentSessionId = sessionData.id;
      this.currentMessages = sessionData.messages;
      return true;
    } catch (error) {
      console.error('Failed to load session:', error);
      return false;
    }
  }

  listSessions(): Array<{ id: string; title: string; updatedAt: number; messageCount: number }> {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.json'));

    return files.map(file => {
      const filePath = path.join(this.sessionsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const session: SessionData = JSON.parse(content);
        return {
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length
        };
      } catch {
        return null;
      }
    }).filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private generateTitle(): string {
    // Generate title from first user message
    const firstUserMsg = this.currentMessages.find(m => m.role === 'user');
    if (firstUserMsg && firstUserMsg.content) {
      const preview = firstUserMsg.content.slice(0, 30);
      return preview.length < firstUserMsg.content.length ? preview + '...' : preview;
    }
    return `会话 ${new Date().toLocaleString('zh-CN')}`;
  }
}
