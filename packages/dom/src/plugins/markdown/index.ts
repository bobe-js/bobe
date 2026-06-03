import type { Plugin } from 'vite';
import type { MarkedExtension } from 'marked';
import { marked } from 'marked';

export interface MarkdownPluginOptions {
  /** 传递给 marked.use() 的扩展配置 */
  marked?: MarkedExtension;
}

/** 对要嵌入模板字面量的字符串进行转义（` $ \） */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/** 将 HTML 字符串编译为 bobe 组件模块源码 */
function gen(html: string): string {
  return [
    `import { bobe } from 'bobe';`,
    `const mdHtml = \`${esc(html)}\`;`,
    `export default bobe\`div html=\${mdHtml}\`;`,
  ].join('\n');
}

/**
 * bobe-markdown Vite 插件。
 *
 * 将 .md / .mdx 文件编译为 bobe 组件：
 *   import Readme from './README.md';
 */
export default function markdownPlugin(opt: MarkdownPluginOptions = {}): Plugin {
  return {
    name: 'bobe-markdown',
    enforce: 'pre',

    configResolved() {
      if (opt.marked) marked.use(opt.marked);
    },

    transform(code, id) {
      if (!id.match(/\.mdx?$/)) return;

      try {
        const html = marked.parse(code) as string;
        return { code: gen(html), moduleSideEffects: false };
      } catch (e: any) {
        this.error(`[bobe-markdown] 解析失败: ${id}\n${e.message}`);
      }
    },
  };
}
