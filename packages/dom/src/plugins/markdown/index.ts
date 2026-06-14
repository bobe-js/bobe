import type { Plugin } from 'vite';
import type { MarkedExtension } from 'marked';
import { marked } from 'marked';
import matter from 'gray-matter';
import { resolve, dirname } from 'path';
import { FileItem, resolveImportTree } from './my-resolve';
import hljs from 'highlight.js';
import { registerBobeLang } from './components/bobe-lang';

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
function gen(
  html: string,
  headers: HeadItem[],
  previewEntries: string[],
  codeTrees: FileItem[][] = [],
  layoutPath?: string,
  routeMeta?: Record<string, any>
): string {
  const hasCode = codeTrees.length > 0;
  const lines = [`import { bobe, Store } from 'bobe';`];

  // layout 组件导入
  if (layoutPath) {
    lines.push(`import __layout from '${layoutPath}';`);
  }

  if (hasCode) {
    lines.push(`import Code from 'bobe-dom/plugin-markdown/code';`);
    previewEntries.forEach((src, i) => {
      lines.push(`import $Bobe_Comp_${i} from '${src}';`);
    });
  }

  lines.push(`const mdHtml = \`${esc(html)}\`;`);

  // 代码树数据
  if (hasCode) {
    for (let i = 0; i < codeTrees.length; i++) {
      lines.push(`const codeTree${i} = ${JSON.stringify(codeTrees[i])};`);
    }
  }

  // Markdown Store 组件
  lines.push(`class Markdown extends Store {`);
  lines.push(`  mdRef = null;`);
  lines.push(`  ui = bobe\``);
  lines.push(`    div class="markdown" style="display: flex; gap: 16px; justify-content: space-between;"`);
  lines.push(`      main ref={mdRef} class="markdown-body" style="overflow-y: auto; flex: 1;" html=\${mdHtml}`);
  lines.push(`      if showAside`);
  lines.push(`        aside class="markdown-aside" style="flex: none; display: flex; flex-direction: column; overflow-y: auto; width: 220px;"`);
  for (const { depth, id, text } of headers) {
    lines.push(
      `          a href="#${id}" children="${esc(text)}" class="markdown-aside-item markdown-aside-depth-${depth}"`
    );
  }
  // tp + Code 组件
  if (hasCode) {
    for (let i = 0; i < codeTrees.length; i++) {
      const previewProp = previewEntries[i] ? `preview=\${() => $Bobe_Comp_${i}}` : '';
      lines.push(`    tp node={mdRef?.querySelector?.('#code-${i}')}`);
      lines.push(`      \${Code} files=\${codeTree${i}} ${previewProp}`);
    }
  }
  lines.push(`    \`;`);
  lines.push(`}`);
  lines.push(`export default Markdown;`);
  if (layoutPath) {
    lines.push(`export { __layout as layout };`);
  }
  if (routeMeta) {
    lines.push(`export const routeMeta = ${JSON.stringify(routeMeta)};`);
  }
  return lines.join('\n');
}

/**
 * bobe-markdown Vite 插件。
 *
 * 将 .md / .mdx 文件编译为 bobe 组件：
 *   import Readme from './README.md';
 *
 * 支持 <code src="xxx.ts" /> 引入代码文件及 import 树（非 node_modules），
 * 以 Code 组件 + tp 传送方式渲染。
 */

export type HeadItem = {
  depth: number;
  id: string;
  text: string;
};

const CODE_TAG_RE = /<code\s+src="([^"]+)"(\s+preview)?\s*\/>/g;

export default function markdownPlugin(opt: MarkdownPluginOptions = {}): Plugin {
  let headers: HeadItem[] = [];
  const headClassMap = {
    '1': 'cyber-title'
  }
  return {
    name: 'bobe-markdown',
    enforce: 'pre',

    configResolved() {
      registerBobeLang(); // 注册 bobe DSL 语法高亮（支持 markdown 中的 ```bobe 代码块）
      marked.use({
        gfm: true, // GitHub Flavored Markdown
        renderer: {
          heading({ tokens, depth }) {
            const text = this.parser.parseInline(tokens);
            const id = text.toLowerCase().replace(/[^\w一-鿿]+/g, '-');
            if (depth <= (opt.asideDeep || 3)) {
              headers.push({ depth, id, text });
            }
            return `<h${depth} class="${headClassMap[depth]}" data-text="${text}" id="${id}">${text}</h${depth}>`;
          },
          code({ text, lang }) {
            return `<pre><code class="hljs">${hljs.highlight(text, { language: lang }).value}</code></pre>`;
          }
        }
      });
      if (opt.marked) marked.use(opt.marked);
    },

    async transform(code, id) {
      if (!id.match(/\.mdx?$/)) return;
      headers = [];
      try {
        // 解析 YAML frontmatter
        const { data, content: mdContent } = matter(code);

        // 提取 routeMeta
        const routeMeta = data.meta as Record<string, any> | undefined;

        // 提取 layout 路径（相对于 .md 文件）
        let layoutPath: string | undefined;
        if (data.layout && typeof data.layout === 'string') {
          layoutPath = data.layout;
        }

        const html = marked.parse(mdContent) as string;

        // 匹配 <code src="xxx.ts"> → <div id="code-N">
        const codeTags: string[] = [];
        const previewEntries: string[] = [];
        let idx = 0;
        const finalHtml = html.replace(CODE_TAG_RE, (_, src, preview) => {
          codeTags.push(src);
          if (preview) {
            previewEntries[idx] = src;
          }
          return `<div id="code-${idx++}"></div>`;
        });

        // 解析每个 code block 的 import 树
        const fileDir = dirname(id);
        const codeTrees = await Promise.all(
          codeTags.map(tag => resolveImportTree(resolve(fileDir, tag), id, this.resolve.bind(this)))
        );

        return { code: gen(finalHtml, headers, previewEntries, codeTrees, layoutPath, routeMeta), moduleSideEffects: false };
      } catch (e: any) {
        this.error(`[bobe-markdown] 解析失败: ${id}\n${e.message}`);
      }
    }
  };
}
