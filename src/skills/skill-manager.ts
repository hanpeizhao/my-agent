import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { parseSkillMd, ParsedSkill, extractToolSpecs, ExtractedToolSpec } from './skill-md.js';

export interface SkillEntry {
  name: string;
  description: string;
  version?: string;
  trigger?: string;
  dir: string;
  skillMd?: ParsedSkill;
  toolSpecs: ExtractedToolSpec[];
  module?: any;              // 激活后加载的 index.js 模块
  activated: boolean;
}

/**
 * SkillManager - 管理 skills 目录
 *
 * 工作方式：
 * 1. 启动时扫描 skills/ 目录，读取每个子目录的 SKILL.md
 * 2. 把所有 SKILL.md 的描述注入 System Prompt（LLM 可读）
 * 3. LLM 调 activate_skill("weather") 时，动态 import index.js
 * 4. 内置工具（read_file, write_file, bash, search）不需要激活
 */
export class SkillManager {
  private skills: Map<string, SkillEntry> = new Map();
  private activatedSkills: Set<string> = new Set();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
    this.scan();
  }

  /**
   * 扫描 skills 目录，加载 SKILL.md
   */
  scan(): void {
    if (!fs.existsSync(this.skillsDir)) {
      console.log(`[SkillManager] Skills dir not found: ${this.skillsDir}`);
      return;
    }

    console.log(`[SkillManager] Scanning: ${this.skillsDir}`);
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    let loadedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(this.skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillMdPath)) {
        console.warn(`[SkillManager] Skipping ${entry.name} (no SKILL.md)`);
        continue;
      }

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const parsed = parseSkillMd(content);
        const toolSpecs = extractToolSpecs(parsed.body);

        this.skills.set(parsed.frontmatter.name, {
          name: parsed.frontmatter.name,
          description: parsed.frontmatter.description,
          trigger: parsed.frontmatter.trigger,
          dir: skillDir,
          skillMd: parsed,
          toolSpecs,
          activated: false
        });

        loadedCount++;
        console.log(`[SkillManager] ✓ Found skill: ${parsed.frontmatter.name} (${toolSpecs.length} tools) - ${parsed.frontmatter.description}`);
      } catch (error: any) {
        console.error(`[SkillManager] Failed to load ${entry.name}:`, error?.message);
      }
    }

    console.log(`[SkillManager] Loaded ${loadedCount} skill(s)`);
  }

  /**
   * 获取所有 skill 信息（用于 /skills 命令）
   */
  getAllSkills(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取所有 SKILL.md 的内容，用于注入 System Prompt
   * 格式：每个 skill 的完整 Markdown 描述
   */
  getSkillsPromptSection(): string {
    const sections: string[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.skillMd) continue;

      const fm = skill.skillMd.frontmatter;
      let section = `### ${fm.name}\n`;
      section += `**描述**: ${fm.description}\n`;
      if (fm.trigger) {
        section += `**触发条件**: ${fm.trigger}\n`;
      }
      section += `\n${skill.skillMd.body}\n`;

      sections.push(section);
    }

    return sections.join('\n---\n\n');
  }

  /**
   * 激活 skill（动态 import index.js）
   */
  async activateSkill(name: string): Promise<any | null> {
    const skill = this.skills.get(name);

    if (!skill) {
      console.log(`[SkillManager] Skill not found: ${name}`);
      return null;
    }

    if (this.activatedSkills.has(name) && skill.module) {
      return skill.module;
    }

    const indexPath = path.join(skill.dir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      console.error(`[SkillManager] ${name}: index.js not found at ${indexPath}`);
      return null;
    }

    try {
      console.log(`[SkillManager] Loading module: ${indexPath}`);
      const moduleUrl = pathToFileURL(indexPath).href;
      const module = await import(moduleUrl);
      const skillModule = module.default || module;

      skill.module = skillModule;
      skill.activated = true;
      this.activatedSkills.add(name);

      const toolCount = skillModule.tools?.length || 0;
      console.log(`[SkillManager] ✓ Activated: ${name} (${toolCount} tools)`);
      return skillModule;
    } catch (error: any) {
      console.error(`[SkillManager] Failed to activate ${name}:`, error?.message);
      return null;
    }
  }

  /**
   * 获取激活的 skill 的工具定义（OpenAI function calling 格式）
   * 从 index.js 的 module.tools[].definition 提取
   */
  getActivatedToolDefinitions(): any[] {
    const tools: any[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.activated || !skill.module?.tools) continue;

      for (const tool of skill.module.tools) {
        if (tool.definition) {
          tools.push(tool.definition);
        }
      }
    }

    return tools;
  }

  /**
   * 在所有已激活的 skill 中查找工具并执行
   */
  async executeTool(toolName: string, args: any): Promise<{ content: string; isError: boolean } | null> {
    for (const skill of this.skills.values()) {
      if (!skill.activated || !skill.module?.tools) continue;

      const tool = skill.module.tools.find((t: any) =>
        t.definition?.function?.name === toolName
      );

      if (tool) {
        try {
          const result = await tool.handler(args);
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
    }

    return null;
  }

  isActivated(name: string): boolean {
    return this.activatedSkills.has(name);
  }
}
