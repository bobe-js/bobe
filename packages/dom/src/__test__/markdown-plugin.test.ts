import { describe, expect, it } from 'vitest';
import markdownPlugin from '../plugins/markdown';

async function transformMarkdown(markdown: string, opt = {}) {
  const plugin = markdownPlugin(opt);
  (plugin.configResolved as any)?.({});
  const result = await (plugin.transform as any).call(
    { resolve: async () => null, error: (err: string) => { throw new Error(err); } },
    markdown,
    '/docs/article.md'
  );
  return result.code as string;
}

describe('markdown plugin', () => {
  it('generates plain-text aside headings without double escaping inline code', async () => {
    const code = await transformMarkdown('## `<code src>` 文件引入');

    expect(code).toContain('"text":"<code src> 文件引入"');
    expect(code).toContain('children={item.text}');
    expect(code).not.toContain('"text":"&lt;code');
    expect(code).not.toContain('children="');
  });

  it('generates hash-driven active aside state with browser guards', async () => {
    const code = await transformMarkdown('# 标题一级');

    expect(code).toContain(`activeHeadingId = '';`);
    expect(code).toContain(`typeof window === 'undefined'`);
    expect(code).toContain(`window.location.hash.slice(1)`);
    expect(code).toContain(`window.addEventListener('hashchange', syncActiveHeading)`);
    expect(code).toContain(`this.activeHeadingId = headings.some(item => item.id === hash) ? hash : '';`);
    expect(code).toContain(`this.updateIndicator();`);
    expect(code).toContain(`markdown-aside-item-active`);
    expect(code).toContain(`markdown-aside-border`);
    expect(code).toContain(`markdown-aside-indicator-active`);
    expect(code).toContain(`window.getComputedStyle(active)`);
    expect(code).toContain(`indicatorHeight = 25;`);
    expect(code).toContain(`active.offsetTop - marginTop + (active.offsetHeight - this.indicatorHeight) / 2`);
  });

  it('respects asideDeep when collecting headings', async () => {
    const code = await transformMarkdown('# A\n\n## B\n\n### C', { asideDeep: 2 });

    expect(code).toContain('"text":"A"');
    expect(code).toContain('"text":"B"');
    expect(code).not.toContain('"text":"C"');
  });
});
