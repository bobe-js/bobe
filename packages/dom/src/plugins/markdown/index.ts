import type { Plugin } from 'vite';
import type { MarkedExtension } from 'marked';
import { marked } from 'marked';

export interface MarkdownPluginOptions {
  /** 传递给 marked.use() 的扩展配置 */
  marked?: MarkedExtension;
  /** 侧边栏的深度，默认为 3，表示提取 h1 - h3 到侧边栏做导航 */
  asideDeep?: number;
}

/** 对要嵌入模板字面量的字符串进行转义（` $ \） */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/** 将 HTML 字符串编译为 bobe 组件模块源码 */
function gen(html: string, headers: HeadItem[]): string {
  const code = [
    `import { bobe } from 'bobe';`,
    `const mdHtml = \`${esc(html)}\`;`,
    `export default bobe\``,
    `  div class="markdown" style="display: flex;"`,
    `    main class="markdown-main" style="overflow-y: auto;" html=\${mdHtml}`,
    `    if showAside`,
    `      div class="markdown-aside" style="display: flex; flex-direction: column; overflow-y: auto;"`,
    ...headers.map(({ depth, id, text }) => {
      return `        a href="#${id}" text="${text}" class="markdown-aside-item markdown-aside-depth-${depth}"`;
    }),
    `\`;`
  ].join('\n');
  return code;
}

/**
 * bobe-markdown Vite 插件。
 *
 * 将 .md / .mdx 文件编译为 bobe 组件：
 *   import Readme from './README.md';
 */

export type HeadItem = {
  depth: number;
  id: string;
  text: string;
};
export default function markdownPlugin(opt: MarkdownPluginOptions = {}): Plugin {
  let headers: HeadItem[] = [];
  return {
    name: 'bobe-markdown',
    enforce: 'pre',

    configResolved() {
      marked.use({
        gfm: true, // GitHub Flavored Markdown
        renderer: {
          heading({ tokens, depth }) {
            const text = this.parser.parseInline(tokens);
            const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-');
            if(depth <= opt.asideDeep || 3) {
              headers.push({ depth, id, text });
            }
            return `<h${depth} id="${id}">${text}</h${depth}>`;
          }
        }
      });
      if (opt.marked) marked.use(opt.marked);
    },

    transform(code, id) {
      if (!id.match(/\.mdx?$/)) return;
      headers = [];
      try {
        const html = marked.parse(code) as string;
        return { code: gen(html, headers), moduleSideEffects: false };
      } catch (e: any) {
        this.error(`[bobe-markdown] 解析失败: ${id}\n${e.message}`);
      }
    }
  };
}
