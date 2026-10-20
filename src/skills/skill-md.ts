/**
 * SKILL.md 解析器
 *
 * 文件格式：
 * ---
 * name: weather
 * description: 天气查询
 * trigger: 用户询问天气、气温、下雨等问题
 * ---
 * # 天气查询技能
 * ## get_weather
 * 参数: city
 * ...
 */

export interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: string;
  version?: string;
  author?: string;
  [key: string]: string | undefined;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;          // Markdown 正文（给 LLM 读）
  raw: string;           // 原始内容
}

/**
 * 解析 SKILL.md 文件
 */
export function parseSkillMd(content: string): ParsedSkill {
  const frontmatter: SkillFrontmatter = {
    name: '',
    description: ''
  };

  let body = content;

  // 解析 frontmatter（--- 包围的部分）
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmContent = fmMatch[1];
    body = fmMatch[2] || '';

    // 简单的 YAML frontmatter 解析
    for (const line of fmContent.split('\n')) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        (frontmatter as any)[key] = value;
      }
    }
  }

  return {
    frontmatter,
    body: body.trim(),
    raw: content
  };
}

/**
 * 从 SKILL.md 的正文中提取工具定义（基于 Markdown 标题）
 *
 * 支持格式：
 * ## tool_name
 * 参数:
 * - city (string, 必填): 城市名称
 * - days (number, 可选): 天数
 * 返回: { temperature, condition }
 */
export interface ExtractedToolSpec {
  name: string;
  description: string;
  parameters: string;   // 原始 Markdown 文本，LLM 可读
  returns: string;
  rawSection: string;   // 整个章节原文
}

export function extractToolSpecs(body: string): ExtractedToolSpec[] {
  const tools: ExtractedToolSpec[] = [];

  // 同时匹配二级标题（## tool_name）和三级标题（### tool_name）
  // 因为 SKILL.md 的工具可能用任意一级标题
  const sections = body.split(/^(?:##|###) /m);

  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split('\n');
    const name = lines[0].trim();

    // 跳过非工具章节（如 "使用规则"、"示例"、"可用工具"）
    if (name === '使用规则' || name === '示例' || name === '说明' ||
        name === '可用工具' || name === '工具' || name.startsWith('规则')) {
      continue;
    }

    // 简单启发式：标题是 snake_case 或 camelCase 才算工具
    if (!/^[a-z][a-zA-Z0-9_]*$/.test(name)) continue;

    tools.push({
      name,
      description: lines.slice(1, 3).join(' ').trim(),
      parameters: extractSection(section, '参数'),
      returns: extractSection(section, '返回'),
      rawSection: section
    });
  }

  return tools;
}

function extractSection(text: string, keyword: string): string {
  const regex = new RegExp(`^${keyword}:?\\s*$([\\s\\S]*?)(?=^\\w+:|^##|$)`, 'm');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}
