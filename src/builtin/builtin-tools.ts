import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SkillManager } from '../skills/skill-manager.js';

/**
 * 内置工具 - 启动时直接可见，无需 activate_skill
 *
 * 5 个工具，职责清晰无重叠：
 * 1. activate_skill - 激活外置 skill
 * 2. read_file      - 读文件（只读）
 * 3. write_file     - 写文件（唯一写工具，支持 overwrite/append/edit 三种模式）
 * 4. bash           - 执行 shell 命令（含 grep/find/node -e）
 * 5. search         - 搜索文件内容（grep 的友好封装）
 */

export interface BuiltinTool {
  definition: {
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
  };
  handler: (args: any, context: BuiltinToolContext) => Promise<any>;
}

export interface BuiltinToolContext {
  skillManager: SkillManager;
  workingDir: string;
}

export function createBuiltinTools(context: BuiltinToolContext): BuiltinTool[] {
  return [
    // ── 1. activate_skill ─────────────────────────────────────
    {
      definition: {
        type: 'function',
        function: {
          name: 'activate_skill',
          description: '激活一个外置 skill，激活后该 skill 的所有工具才可用。使用前请先参考 System Prompt 中的 "可用 SKILL 清单" 选择合适的 skill。',
          parameters: {
            type: 'object',
            properties: {
              skillName: {
                type: 'string',
                description: '要激活的 skill 名称（如 weather、flight、location）'
              }
            },
            required: ['skillName']
          }
        }
      },
      handler: async (args) => {
        const { skillName } = args;
        console.log(`[Builtin] Activating skill: ${skillName}`);

        const module = await context.skillManager.activateSkill(skillName);

        if (!module) {
          return {
            success: false,
            error: `Skill "${skillName}" not found or failed to load`
          };
        }

        const toolNames = module.tools?.map((t: any) => t.definition.function.name) || [];

        const skillEntry = context.skillManager.getAllSkills().find(s => s.name === skillName);
        const skillMdContent = skillEntry?.skillMd?.body || '';
        const skillMdFrontmatter = (skillEntry?.skillMd?.frontmatter || {}) as any;

        return {
          success: true,
          skillName,
          message: `Skill "${skillName}" activated. ${toolNames.length} tools are now available: ${toolNames.join(', ')}`,
          availableTools: toolNames,
          skillDocumentation: {
            name: skillMdFrontmatter.name,
            description: skillMdFrontmatter.description,
            trigger: skillMdFrontmatter.trigger,
            body: skillMdContent
          }
        };
      }
    },

    // ── 2. read_file ──────────────────────────────────────────
    {
      definition: {
        type: 'function',
        function: {
          name: 'read_file',
          description: '读取指定文件的内容，输出带行号。这是唯一的读文件工具。修改代码时先 read_file 看到行号，再用 write_file(mode="edit") 按行号修改。',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件路径'
              },
              startLine: {
                type: 'number',
                description: '起始行号（从 1 开始，可选）'
              },
              endLine: {
                type: 'number',
                description: '结束行号（可选）'
              }
            },
            required: ['path']
          }
        }
      },
      handler: async (args) => {
        const filePath = resolvePath(args.path, context.workingDir);
        console.log(`[Builtin] Reading file: ${filePath}`);

        if (!fs.existsSync(filePath)) {
          return { error: `File not found: ${filePath}` };
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          return { error: `Path is a directory, not a file: ${filePath}` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const allLines = content.split('\n');
        const totalLines = allLines.length;

        const startLine = args.startLine ? Math.max(1, args.startLine) : 1;
        const endLine = args.endLine ? Math.min(totalLines, args.endLine) : Math.min(totalLines, 2000);
        const truncated = totalLines > 2000 && !args.endLine;

        const numberedLines: string[] = [];
        for (let i = startLine - 1; i < endLine; i++) {
          const lineNum = i + 1;
          const padded = String(lineNum).padStart(5, ' ');
          numberedLines.push(`${padded}  ${allLines[i] || ''}`);
        }

        const ext = path.extname(filePath).toLowerCase().slice(1);

        return {
          path: filePath,
          language: ext,
          totalLines,
          startLine,
          endLine,
          truncated,
          content: numberedLines.join('\n')
        };
      }
    },

    // ── 3. write_file ─────────────────────────────────────────
    // 唯一的写文件工具，统一三种模式：
    //   overwrite - 覆盖整个文件（创建新文件或大范围重写）
    //   append    - 追加到文件末尾（大文件分段写入）
    //   edit      - 按行号精确编辑（replace/insert/delete）
    {
      definition: {
        type: 'function',
        function: {
          name: 'write_file',
          description: `写入文件。这是唯一的写文件工具，支持三种模式：
- mode="overwrite"（默认）：覆盖整个文件。用于创建新文件或大范围重写。
- mode="append"：追加到文件末尾。用于大文件分段写入（先 overwrite 创建，再 append 追加）。
- mode="edit"：按行号精确编辑。需要 startLine/endLine + editMode 参数。用于修改少量行。

写入后 .js/.ts/.json 文件会自动做语法检查，返回 diff 摘要。`,
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件路径'
              },
              content: {
                type: 'string',
                description: '要写入的内容（overwrite/append/edit 的 replace/insert 模式必填）'
              },
              mode: {
                type: 'string',
                enum: ['overwrite', 'append', 'edit'],
                description: '写入模式（默认 overwrite）'
              },
              startLine: {
                type: 'number',
                description: '起始行号（mode="edit" 时必填，从 1 开始）'
              },
              endLine: {
                type: 'number',
                description: '结束行号（mode="edit" 时必填，含此行）'
              },
              editMode: {
                type: 'string',
                enum: ['replace', 'insert', 'delete'],
                description: '编辑子模式（mode="edit" 时必填）：replace=替换行范围，insert=在 startLine 前插入，delete=删除行范围'
              }
            },
            required: ['path', 'content']
          }
        }
      },
      handler: async (args) => {
        const filePath = resolvePath(args.path, context.workingDir);
        const mode = args.mode || 'overwrite';
        console.log(`[Builtin] Writing file: ${filePath} (mode=${mode})`);

        try {
          const parentDir = path.dirname(filePath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }

          // 记录原内容
          let oldContent: string | null = null;
          if (fs.existsSync(filePath)) {
            oldContent = fs.readFileSync(filePath, 'utf-8');
          }

          // ── 执行写入 ──
          if (mode === 'overwrite') {
            fs.writeFileSync(filePath, args.content);
          } else if (mode === 'append') {
            if (fs.existsSync(filePath)) {
              fs.appendFileSync(filePath, args.content);
            } else {
              fs.writeFileSync(filePath, args.content);
            }
          } else if (mode === 'edit') {
            if (!fs.existsSync(filePath)) {
              return { success: false, error: `File not found: ${filePath}` };
            }

            const lines = oldContent!.split('\n');
            const startLine = args.startLine || 1;
            const endLine = args.endLine || startLine;
            const editMode = args.editMode || 'replace';
            const contentLines = (args.content || '').split('\n');

            let newLines: string[];
            switch (editMode) {
              case 'replace': {
                const before = lines.slice(0, startLine - 1);
                const after = lines.slice(endLine);
                newLines = [...before, ...contentLines, ...after];
                break;
              }
              case 'insert': {
                const before = lines.slice(0, startLine - 1);
                const after = lines.slice(startLine - 1);
                newLines = [...before, ...contentLines, ...after];
                break;
              }
              case 'delete': {
                const before = lines.slice(0, startLine - 1);
                const after = lines.slice(endLine);
                newLines = [...before, ...after];
                break;
              }
              default:
                return { success: false, error: `Unknown editMode: ${editMode}` };
            }

            fs.writeFileSync(filePath, newLines.join('\n'));
          } else {
            return { success: false, error: `Unknown mode: ${mode}` };
          }

          // ── 语法检查（append 模式跳过） ──
          const ext = path.extname(filePath).toLowerCase();
          let syntaxCheck: any = null;
          if (mode !== 'append') {
            if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
              syntaxCheck = await checkJavaScriptSyntax(filePath);
            } else if (ext === '.json') {
              syntaxCheck = checkJsonSyntax(filePath);
            }
          } else {
            syntaxCheck = { skipped: true, reason: 'append mode' };
          }

          // ── diff 摘要 ──
          let diffSummary: any = null;
          if (oldContent !== null) {
            const newContent = fs.readFileSync(filePath, 'utf-8');
            diffSummary = computeDiffSummary(oldContent, newContent);
          }

          const stat = fs.statSync(filePath);
          return {
            success: true,
            path: filePath,
            mode,
            bytes: stat.size,
            diff: diffSummary,
            syntaxCheck
          };
        } catch (error: any) {
          return {
            success: false,
            error: error?.message || String(error)
          };
        }
      }
    },

    // ── 4. bash ───────────────────────────────────────────────
    {
      definition: {
        type: 'function',
        function: {
          name: 'bash',
          description: `执行 shell 命令并返回输出。当前运行在 ${process.platform} 平台，${process.platform === 'win32' ? '使用 Git Bash 语法（支持 ls、cat、grep 等基本 Unix 命令，但 mkdir 不需要 -p 参数）' : '使用 bash 语法'}。支持管道、重定向、node -e 内联脚本。⚠️ 危险命令（rm -rf、format 等）会被自动拦截。批量处理文件内容时可以用 node -e "..." 内联脚本。`,
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令'
              },
              cwd: {
                type: 'string',
                description: '工作目录（可选）'
              },
              timeout: {
                type: 'number',
                description: '超时毫秒（默认 30000）'
              }
            },
            required: ['command']
          }
        }
      },
      handler: async (args) => {
        const cwd = args.cwd ? resolvePath(args.cwd, context.workingDir) : context.workingDir;
        const timeout = args.timeout || 30000;
        const command = args.command;

        console.log(`[Builtin] Executing: ${command} (cwd=${cwd})`);

        const dangerous = /^(rm -rf|format|mkfs|dd if=|sudo)/i;
        if (dangerous.test(command.trim())) {
          return {
            error: `Command blocked (potentially dangerous): ${command}`,
            hint: 'If you really need to run this, ask the user to execute it manually.'
          };
        }

        try {
          const output = execSync(command, {
            cwd,
            timeout,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          return {
            command,
            cwd,
            exitCode: 0,
            stdout: output,
            stderr: ''
          };
        } catch (error: any) {
          return {
            command,
            cwd,
            exitCode: error.status || -1,
            stdout: error.stdout || '',
            stderr: error.stderr || error.message
          };
        }
      }
    },

    // ── 5. search ─────────────────────────────────────────────
    {
      definition: {
        type: 'function',
        function: {
          name: 'search',
          description: '在目录下搜索文件内容（基于 grep/ripgrep）。返回结构化结果（文件名、行号、内容）。比 bash grep 更友好，适合代码搜索场景。',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '搜索的正则表达式或文本'
              },
              path: {
                type: 'string',
                description: '搜索的目录（默认工作目录）'
              },
              glob: {
                type: 'string',
                description: '文件名通配符，如 "*.ts"'
              },
              maxResults: {
                type: 'number',
                description: '最大返回结果数（默认 50）'
              }
            },
            required: ['pattern']
          }
        }
      },
      handler: async (args) => {
        const searchPath = args.path ? resolvePath(args.path, context.workingDir) : context.workingDir;
        const pattern = args.pattern;
        const glob = args.glob || '';
        const maxResults = args.maxResults || 50;

        console.log(`[Builtin] Searching: "${pattern}" in ${searchPath}`);

        if (!fs.existsSync(searchPath)) {
          return { error: `Path not found: ${searchPath}` };
        }

        let cmd = '';
        if (args.glob) {
          cmd = `rg --line-number --no-heading --color never -g "${glob}" "${pattern}" "${searchPath}" 2>nul || grep -rn --include="${glob}" "${pattern}" "${searchPath}"`;
        } else {
          cmd = `rg --line-number --no-heading --color never "${pattern}" "${searchPath}" 2>nul || grep -rn "${pattern}" "${searchPath}"`;
        }

        try {
          const output = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
            timeout: 30000,
            shell: 'bash'
          });

          const lines = output.split('\n').filter(Boolean).slice(0, maxResults);
          const results = lines.map(line => {
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
              return {
                file: match[1],
                line: parseInt(match[2], 10),
                content: match[3]
              };
            }
            return { raw: line };
          });

          return {
            pattern,
            path: searchPath,
            matches: results.length,
            results
          };
        } catch (error: any) {
          if (error.status === 1) {
            return {
              pattern,
              path: searchPath,
              matches: 0,
              results: []
            };
          }
          return { error: error.message };
        }
      }
    }
  ];
}

// ── 辅助函数 ────────────────────────────────────────────────

function resolvePath(p: string, workingDir: string): string {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.resolve(workingDir, p);
}

async function checkJavaScriptSyntax(filePath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    execSync(`node --check "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { valid: true };
  } catch (error: any) {
    const stderr = error.stderr || error.message || '';
    const match = stderr.match(/(?:SyntaxError|ReferenceError)[\s\S]*?(?=\n\s*at|\n$|$)/);
    return {
      valid: false,
      error: match ? match[0].trim() : stderr.slice(0, 500)
    };
  }
}

function checkJsonSyntax(filePath: string): { valid: boolean; error?: string } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message
    };
  }
}

function computeDiffSummary(oldContent: string, newContent: string): {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  totalChanges: number;
  sampleChanges: string[];
} {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const oldSet = new Map<string, number>();
  const newSet = new Map<string, number>();

  for (const line of oldLines) {
    oldSet.set(line, (oldSet.get(line) || 0) + 1);
  }
  for (const line of newLines) {
    newSet.set(line, (newSet.get(line) || 0) + 1);
  }

  let added = 0;
  let removed = 0;
  const allKeys = new Set([...oldSet.keys(), ...newSet.keys()]);

  for (const line of allKeys) {
    const oldCount = oldSet.get(line) || 0;
    const newCount = newSet.get(line) || 0;
    if (newCount > oldCount) {
      added += newCount - oldCount;
    } else if (oldCount > newCount) {
      removed += oldCount - newCount;
    }
  }

  const modified = Math.min(added, removed);
  const unchanged = Math.min(oldLines.length, newLines.length) - modified;
  const totalChanges = added + removed;

  const sampleChanges: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);
  let sampledCount = 0;
  for (let i = 0; i < maxLines && sampledCount < 5; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine !== newLine) {
      if (oldLine !== undefined) {
        sampleChanges.push(`- ${i + 1}: ${oldLine.slice(0, 80)}`);
      }
      if (newLine !== undefined) {
        sampleChanges.push(`+ ${i + 1}: ${newLine.slice(0, 80)}`);
      }
      sampledCount++;
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged: Math.max(0, unchanged),
    totalChanges,
    sampleChanges
  };
}

export function getBuiltinToolDefinitions(builtinTools: BuiltinTool[]): any[] {
  return builtinTools.map(t => t.definition);
}

export async function executeBuiltinTool(
  builtinTools: BuiltinTool[],
  toolName: string,
  args: any,
  context: BuiltinToolContext
): Promise<{ content: string; isError: boolean } | null> {
  const tool = builtinTools.find(t => t.definition.function.name === toolName);
  if (!tool) return null;

  try {
    const result = await tool.handler(args, context);
    return {
      content: JSON.stringify(result),
      isError: false
    };
  } catch (error: any) {
    return {
      content: JSON.stringify({ error: error?.message || String(error) }),
      isError: true
    };
  }
}
