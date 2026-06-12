import hljs, { Language } from 'highlight.js';

/**
 * 注册 bobe DSL 语法高亮。
 *
 * 1. 注册 `bobe` 独立语言（用于 markdown 中 ```bobe 代码块）
 * 2. 给 JavaScript grammar 打补丁，让 `bobe`...`` 标签模板被 TS/JS 代码块自动识别
 *
 * bobe 采用类似 Pug 的缩进风格，语法要素：
 * - 元素标签：div, span, h1-h6, a, p, ul, li, button, input ...
 * - 属性：class="...", id="...", children="...", onclick={...}, ref={...}
 * - 控制流：if, else, for, tp
 * - 响应式绑定：{expr}
 * - 模板插值：${expr}
 * - 字符串："hello"
 * - 注释：# comment
 */
export function registerBobeLang() {
  // ================================================================
  // Part 1: 注册 bobe 独立语言
  // ================================================================
  hljs.registerLanguage('bobe', (hljs) => {
    // 属性名列表（含事件处理器和布尔属性）
    const ATTRS = [
      'class', 'id', 'children', 'html', 'style', 'href', 'src', 'alt', 'title',
      'ref', 'type', 'placeholder', 'value', 'name', 'foo',
      'disabled', 'readonly', 'checked', 'selected', 'hidden',
      'role', 'target', 'rel', 'width', 'height', 'tabindex',
      'data-[\\w-]+', 'aria-[\\w-]+',
      'onclick', 'oninput', 'onchange', 'onsubmit', 'onreset',
      'onkeydown', 'onkeyup', 'onkeypress',
      'onfocus', 'onblur', 'onmouseenter', 'onmouseleave',
      'onmousemove', 'onmouseover', 'onmouseout',
      'onload', 'onerror', 'onscroll', 'onresize',
      'ondrag', 'ondragstart', 'ondragend', 'ondragover', 'ondrop',
      'ontouchstart', 'ontouchend', 'ontouchmove',
    ].join('|');

    return {
      name: 'bobe',
      // keywords: {
      //   $pattern: /\b(if|else|for|tp)\b/,
      //   keyword: 'if else for tp'
      // },
      keywords: ['if','else','for','tp','context'],
      contains: [
        // ----------------------------------------------------------
        // 1. 行注释 — # 到行尾
        // ----------------------------------------------------------
        hljs.COMMENT('#', '$', { relevance: 0 }),

        // ----------------------------------------------------------
        // 2. 模板插值 ${expr} — bobe 组件/表达式嵌入
        // ----------------------------------------------------------
        {
          className: 'template-substitution',
          begin: /\$\{/,
          end: /\}/,
          contains: [
            { begin: /\$\{/, end: /\}/, skip: true },
          ],
          subLanguage: 'javascript',
        },

        // ----------------------------------------------------------
        // 3. 响应式绑定 {expr} — 跟在 = 后面（不含 $）
        // ----------------------------------------------------------
        {
          className: 'template-substitution',
          begin: /(?<==)\{/,
          end: /\}/,
          contains: [
            { begin: /\{/, end: /\}/, skip: true },
          ],
          subLanguage: 'javascript',
        },

        // ----------------------------------------------------------
        // 4. 双引号字符串 — 内部可含 ${} 插值
        // ----------------------------------------------------------
        {
          className: 'string',
          begin: /"/,
          end: /"/,
          contains: [
            {
              begin: /\$\{/,
              end: /\}/,
              subLanguage: 'javascript',
            }
          ]
        },

        // ----------------------------------------------------------
        // 5. 元素标签 — 行首缩进后的第一个标识符（排除关键字）
        //    泛化匹配：bobe 缩进语法中每行首个标识符必是标签或关键字
        // ----------------------------------------------------------
        {
          className: 'selector-tag',
          begin: /^[ \t]*(?!(?:if|else|for|tp)\b)[a-z][\w-]*(?:-[a-z][\w-]*)*\b/m,
          relevance: 2,
        },

        // ----------------------------------------------------------
        // 6. 属性名 — key=value 形式
        // ----------------------------------------------------------
        {
          className: 'attr',
          begin: new RegExp(`\\b(?:${ATTRS})\\b(?=\\s*=)`),
          relevance: 1,
        },

        // ----------------------------------------------------------
        // 7. 布尔属性 — 独立出现，不跟 =
        // ----------------------------------------------------------
        {
          className: 'attr',
          begin: /\b(?:disabled|readonly|checked|selected|hidden)\b(?!\s*=)/,
          relevance: 0,
        },

        // ----------------------------------------------------------
        // 8. for 循环变量 — for items; item i
        // ----------------------------------------------------------
        {
          className: 'variable',
          begin: /(?<=for\s+)\w+(?=\s*;)/,
          relevance: 0,
        },
        {
          className: 'params',
          begin: /(?<=for\s+\S+\s*;\s*)\w+/,
          relevance: 0,
        },
        {
          className: 'params',
          begin: /(?<=for\s+\S+\s*;\s*\w+\s+)\w+/,
          relevance: 0,
        },

        // ----------------------------------------------------------
        // 9. 数字字面量
        // ----------------------------------------------------------
        hljs.NUMBER_MODE,
      ]
    } as Language;
  });

  // ================================================================
  // Part 2: 给 JS-family grammars 打补丁，让 `bobe`...`` 标签模板被识别
  // ================================================================
  function patchJsFamily(name: string) {
    const fn = (hljs.getLanguage(name) as any)?.rawDefinition as
      | ((hljs: any) => any)
      | undefined;
    if (!fn) return;

    const def = fn(hljs);

    // 避免重复注册
    if (def.contains.some((c: any) =>
      c.begin?.toString?.().includes('bobe')
    )) return;

    // 复刻该 grammar 的 keywords（用于 SUBST 中的 JS 表达式高亮）
    const SUBST = {
      className: 'subst',
      begin: /\$\{/,
      end: /\}/,
      keywords: def.keywords,
    };

    def.contains.push({
      begin: /\.?bobe`/, // 匹配 bobe` 或 .bobe`
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [hljs.BACKSLASH_ESCAPE, SUBST],
        subLanguage: 'bobe',
      },
    });

    hljs.registerLanguage(name, () => def);
  }

  patchJsFamily('javascript');
  patchJsFamily('typescript');
}
