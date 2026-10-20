// web_search skill - 联网搜索
//
// 实现说明：
// - web_search: 用 DuckDuckGo HTML 版（https://html.duckduckgo.com/html/?q=...）
//   无需 API Key，通过解析 HTML 提取结果
// - fetch_url: 抓取网页正文，去掉 script/style/标签

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default {
  tools: [
    {
      definition: {
        type: 'function',
        function: {
          name: 'web_search',
          description: '搜索互联网并返回结果。用于获取最新资讯、产品推荐、实时信息等 LLM 训练数据之外的内容。',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词，使用自然语言（如"感冒药推荐"、"最新 AI 新闻"）'
              },
              max_results: {
                type: 'number',
                description: '返回结果数，默认 5，最多 10',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['query']
          }
        }
      },
      handler: async (args) => {
        const query = args.query;
        const maxResults = args.max_results || 5;
        console.log(`[web_search] Querying: "${query}" (max=${maxResults})`);

        // 尝试多个搜索引擎，依次降级
        const engines = [
          {
            name: 'DuckDuckGo',
            url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            parse: parseDuckDuckGo
          },
          {
            name: 'Bing',
            url: `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`,
            parse: parseBing
          }
        ];

        for (const engine of engines) {
          try {
            console.log(`[web_search] Trying ${engine.name}...`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(engine.url, {
              signal: controller.signal,
              headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
              }
            });
            clearTimeout(timeout);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();
            const results = engine.parse(html).slice(0, maxResults);

            if (results.length > 0) {
              console.log(`[web_search] ✓ Got ${results.length} results from ${engine.name}`);
              return {
                query,
                engine: engine.name,
                total: results.length,
                results
              };
            }
            console.log(`[web_search] ${engine.name} returned no results, trying next...`);
          } catch (error) {
            console.log(`[web_search] ${engine.name} failed: ${error.message}`);
          }
        }

        return {
          query,
          error: '所有搜索引擎都失败了',
          results: []
        };
      }
    },

    {
      definition: {
        type: 'function',
        function: {
          name: 'fetch_url',
          description: '抓取指定 URL 的网页正文内容（去掉 HTML 标签）。用于深入查看搜索结果中的具体页面。',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '要抓取的完整 URL'
              },
              max_length: {
                type: 'number',
                description: '最大返回字符数，默认 5000',
                minimum: 500,
                maximum: 20000
              }
            },
            required: ['url']
          }
        }
      },
      handler: async (args) => {
        const url = args.url;
        const maxLength = args.max_length || 5000;
        console.log(`[fetch_url] Fetching: ${url} (max=${maxLength})`);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            redirect: 'follow'
          });
          clearTimeout(timeout);

          if (!response.ok) {
            return { url, error: `HTTP ${response.status}` };
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            return { url, error: `Unsupported content type: ${contentType}` };
          }

          const html = await response.text();
          const title = extractTitle(html);
          const content = extractMainContent(html, maxLength);

          return {
            url,
            title,
            content,
            length: content.length,
            truncated: content.length >= maxLength
          };
        } catch (error) {
          return { url, error: error.message };
        }
      }
    }
  ]
};

// ── DuckDuckGo HTML 解析 ─────────────────────────────────
function parseDuckDuckGo(html) {
  const results = [];
  // DuckDuckGo HTML 版的结果格式: <a class="result__a" href="...">title</a>
  // 摘要在 <a class="result__snippet"> 或 <div class="result__snippet">
  const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const links = [];
  const snippets = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      url: decodeDdgUrl(match[1]),
      title: stripTags(match[2]).trim()
    });
  }

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(match[1]).trim());
  }

  // 合并 links 和 snippets
  for (let i = 0; i < links.length; i++) {
    if (links[i].url && links[i].title) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || ''
      });
    }
  }

  return results;
}

// DuckDuckGo 的链接是 redirect 形式: //duckduckgo.com/l/?uddg=<encoded_url>
function decodeDdgUrl(href) {
  try {
    const match = href.match(/uddg=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    if (href.startsWith('//')) {
      return 'https:' + href;
    }
    return href;
  } catch {
    return href;
  }
}

// ── Bing HTML 解析 ──────────────────────────────────────
function parseBing(html) {
  const results = [];
  // Bing 结果格式: <li class="b_algo"><h2><a href="...">title</a></h2><p>snippet</p></li>
  const itemRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;

  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const item = match[1];
    const linkMatch = item.match(/<a[^>]*href="(http[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = item.match(/<p[^>]*>([\s\S]*?)<\/p>/);

    if (linkMatch) {
      results.push({
        title: stripTags(linkMatch[2]).trim(),
        url: linkMatch[1],
        snippet: snippetMatch ? stripTags(snippetMatch[1]).trim() : ''
      });
    }
  }

  return results;
}

// ── 工具函数 ────────────────────────────────────────────
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function extractMainContent(html, maxLength) {
  // 移除 script、style、nav、footer 等
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 优先提取 <article> 或 <main> 内容
  const mainMatch = content.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (mainMatch) {
    content = mainMatch[1];
  } else {
    // 退而求其次，提取 <p> 标签内容
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(content)) !== null) {
      const text = stripTags(m[1]);
      if (text.length > 20) {
        paragraphs.push(text);
      }
    }
    if (paragraphs.length > 0) {
      content = paragraphs.join('\n\n');
    } else {
      content = stripTags(content);
    }
  }

  // 清理多余空白
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  // 截断到最大长度
  if (content.length > maxLength) {
    content = content.slice(0, maxLength) + '\n\n[... truncated ...]';
  }

  return content;
}
