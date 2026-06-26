import { parseHtmlToFibers } from '#/parse-html';
import { SSRFiber } from '#/type';

/** 收集 root.child 下的所有顶层节点（通过 next 链表） */
function tops(root: SSRFiber): SSRFiber[] {
  const list: SSRFiber[] = [];
  let node = root.child;
  while (node) {
    list.push(node);
    node = node.next;
  }
  return list;
}

/** 收集一个 fiber 及其子树的所有节点（深度优先），方便验证结构 */
function collect(fiber: SSRFiber): { type: string; props: Record<string, any>; depth: number }[] {
  const result: { type: string; props: Record<string, any>; depth: number }[] = [];
  const walk = (node: SSRFiber | undefined, depth: number) => {
    if (!node) return;
    result.push({ type: node.type, props: { ...node.props }, depth });
    if (node.child) walk(node.child, depth + 1);
    if (node.next) walk(node.next, depth);
  };
  walk(fiber.child, 0);
  return result;
}

/** 快捷调用：创建 root 并解析 */
function parse(html: string): SSRFiber {
  const root = new SSRFiber('root');
  parseHtmlToFibers(html, root);
  return root;
}

describe('parseHtmlToFibers', () => {
  // ==================== 基础解析 ====================
  it('应为简单标签创建一个子 fiber', () => {
    const root = parse('<div></div>');
    const list = tops(root);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('div');
    expect(list[0].parent).toBe(root);
  });

  it('应为自闭合标签创建一个 fiber', () => {
    const root = parse('<br/>');
    const list = tops(root);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('br');
  });

  it('应为多个顶层标签创建多个 fiber', () => {
    const root = parse('<span></span><em></em>');
    const list = tops(root);
    expect(list).toHaveLength(2);
    expect(list[0].type).toBe('span');
    expect(list[1].type).toBe('em');
    // 兄弟链表连接
    expect(list[0].next).toBe(list[1]);
    // parent 均为 root
    expect(list[0].parent).toBe(root);
    expect(list[1].parent).toBe(root);
  });

  it('应处理空字符串', () => {
    const root = parse('');
    expect(root.child).toBeUndefined();
  });

  it('空白字符也应保留为文本节点', () => {
    const root = parse('   \n  ');
    expect(root.child).not.toBeUndefined();
    expect(root.child!.type).toBe('text');
  });

  // ==================== 嵌套结构 ====================
  it('应正确构建父子树结构', () => {
    const root = parse('<div><span></span></div>');
    const div = root.child!;
    expect(div.type).toBe('div');
    expect(div.child).not.toBeNull();
    expect(div.child!.type).toBe('span');
    expect(div.child!.parent).toBe(div);
  });

  it('应正确处理多层嵌套', () => {
    const root = parse('<div><ul><li><em></em></li></ul></div>');
    const nodes = collect(root);
    expect(nodes.map(n => n.type)).toEqual(['div', 'ul', 'li', 'em']);
    expect(nodes.map(n => n.depth)).toEqual([0, 1, 2, 3]);
  });

  it('应正确处理多子节点', () => {
    const root = parse('<ul><li></li><li></li><li></li></ul>');
    const ul = root.child!;
    expect(ul.type).toBe('ul');
    // 三个 li 通过 child → next → next 连接
    const li1 = ul.child!;
    const li2 = li1.next!;
    const li3 = li2.next!;
    expect(li1.type).toBe('li');
    expect(li2.type).toBe('li');
    expect(li3.type).toBe('li');
    expect(li3.next).toBeUndefined();
    // parent 正确
    expect(li1.parent).toBe(ul);
    expect(li2.parent).toBe(ul);
    expect(li3.parent).toBe(ul);
  });

  // ==================== 文本节点 ====================
  it('应创建 text 类型的 fiber', () => {
    const root = parse('<p>hello world</p>');
    const p = root.child!;
    expect(p.child).not.toBeNull();
    expect(p.child!.type).toBe('text');
    expect(p.child!.props.children).toBe('hello world');
  });

  it('应处理元素和文本混合', () => {
    const root = parse('<p>before<em>inner</em>after</p>');
    const p = root.child!;
    expect(p.child!.type).toBe('text');
    expect(p.child!.props.children).toBe('before');
    expect(p.child!.next!.type).toBe('em');
    expect(p.child!.next!.child!.props.children).toBe('inner');
    expect(p.child!.next!.next!.type).toBe('text');
    expect(p.child!.next!.next!.props.children).toBe('after');
  });

  it('应保留空白文本', () => {
    const root = parse('<ul>\n  <li></li>\n</ul>');
    const ul = root.child!;
    // 保留换行空白文本：text → li → text
    expect(ul.child!.type).toBe('text');
    expect(ul.child!.next!.type).toBe('li');
    expect(ul.child!.next!.next!.type).toBe('text');
  });

  // ==================== 属性解析 ====================
  it('应正确解析属性', () => {
    const root = parse('<div id="myId" class="container"></div>');
    expect(root.child!.props).toEqual({ id: 'myId', class: 'container' });
    expect(root.child!._classSlots?.class).toBe(0);
    expect(root.child!._classList).toEqual(['container']);
  });

  it('应将 class 属性同步为 class slot 结构', () => {
    const root = parse('<div class="foo bar"></div>');
    expect(root.child!.props.class).toBe('foo bar');
    expect(root.child!._classSlots?.class).toBe(0);
    expect(root.child!._classList).toEqual(['foo bar']);
  });

  it('应正确处理属性值中的 >', () => {
    const root = parse('<div title="a > b"></div>');
    expect(root.child!.props.title).toBe('a > b');
  });

  it('应正确处理属性值中的 <', () => {
    const root = parse('<img alt="a < b && c > d"/>');
    expect(root.child!.props.alt).toBe('a < b && c > d');
  });

  it('应正确处理单引号属性值', () => {
    const root = parse("<div data-val='1 > 2'></div>");
    expect(root.child!.props['data-val']).toBe('1 > 2');
  });

  it('应正确处理 JSON 字符串属性', () => {
    const root = parse('<div aria-label=\'{"key": "val > 0"}\'></div>');
    expect(root.child!.props['aria-label']).toBe('{"key": "val > 0"}');
  });

  it('应正确处理布尔属性', () => {
    const root = parse('<input disabled/>');
    expect(root.child!.props.disabled).toBe('');
  });

  it('应正确处理多个布尔属性混合', () => {
    const root = parse('<input disabled readonly id="x"/>');
    expect(root.child!.props.disabled).toBe('');
    expect(root.child!.props.readonly).toBe('');
    expect(root.child!.props.id).toBe('x');
  });

  it('应正确解析 data-* 属性', () => {
    const root = parse('<div data-id="123" data-name="test"></div>');
    expect(root.child!.props).toEqual({ 'data-id': '123', 'data-name': 'test' });
  });

  it('应解析无引号属性值', () => {
    const root = parse('<div data-x=hello></div>');
    expect(root.child!.props['data-x']).toBe('hello');
  });

  // ==================== 复杂场景 ====================
  it('应处理模拟 markdown 代码块注入的 HTML', () => {
    const html = `
      <div id="code-block-area" class="code-blocks">
        <div id="code-0" class="code-block code-block-active" data-lang="typescript">
          <pre class="hljs"><code class="language-ts">const x = 1</code></pre>
        </div>
        <div id="code-1" class="code-block" data-lang='rust'>
          <pre class="hljs"><code class="language-rust">let y = 2</code></pre>
        </div>
      </div>
    `;
    const root = parse(html);
    // 多行 HTML 开头有换行空白文本节点，跳过找到第一个元素
    const area = root.child!.type === 'text' ? root.child!.next! : root.child!;
    expect(area.props.id).toBe('code-block-area');

    // area 子节点: text(空白) → code-0 → text(空白) → code-1 → text(空白)
    const code0 = area.child!.next!; // 跳过开头的空白 text
    expect(code0.props.id).toBe('code-0');
    expect(code0.props.class).toBe('code-block code-block-active');
    // code-1 是 code-0 的下下个（中间隔了一个空白 text）
    const code1 = code0.next!.next!;
    expect(code1.props['data-lang']).toBe('rust');
  });

  it('应处理含 URL 特殊字符的属性', () => {
    const root = parse('<a href="/path?x=1&y=2"></a>');
    expect(root.child!.props.href).toBe('/path?x=1&y=2');
  });

  it('应处理带 hash 的 URL', () => {
    const root = parse('<a href="#section"></a>');
    expect(root.child!.props.href).toBe('#section');
  });

  it('应处理多个顶层节点 + 嵌套混合', () => {
    const html = '<header><h1>Title</h1></header><main><p>Body</p></main><footer></footer>';
    const root = parse(html);
    const list = tops(root);
    expect(list).toHaveLength(3);
    expect(list[0].type).toBe('header');
    expect(list[1].type).toBe('main');
    expect(list[2].type).toBe('footer');
    // 兄弟链表
    expect(list[0].next).toBe(list[1]);
    expect(list[1].next).toBe(list[2]);
    expect(list[2].next).toBeUndefined();
  });

  // ==================== SSRFiber 树可用性验证 ====================
  it('返回的 fiber 树应可通过遍历收集所有节点', () => {
    const html = '<div id="div-root"><span id="s1">a</span><span id="s2">b</span></div>';
    const root = parse(html);
    const nodes = collect(root);
    // div → span#s1 → text("a") → span#s2 → text("b")
    expect(nodes).toHaveLength(5);
    expect(nodes[0].type).toBe('div');
    expect(nodes[1].type).toBe('span');
    expect(nodes[1].props.id).toBe('s1');
    expect(nodes[2].type).toBe('text');
    expect(nodes[3].type).toBe('span');
    expect(nodes[3].props.id).toBe('s2');
    expect(nodes[4].type).toBe('text');
  });

  it('应保持正确的兄弟链表（无 parent 泄露到兄弟间）', () => {
    const root = parse('<div><a></a><b></b></div>');
    const div = root.child!;
    const a = div.child!;
    const b = a.next!;
    expect(a.parent).toBe(div);
    expect(b.parent).toBe(div);
  });

  it('叶子节点 child 应为 undefined', () => {
    const root = parse('<br/>');
    expect(root.child!.child).toBeUndefined();
  });

  // ==================== openTagEnd ====================
  it('openTagEnd: <input> 记录 > 的 index', () => {
    const html = '<input>';
    const root = parse(html);
    const idx = html.indexOf('>');
    expect(root.child!.openTagEnd).toBe(idx);
  });

  it('openTagEnd: <input/> 记录 > 的 index', () => {
    const html = '<input/>';
    const root = parse(html);
    const idx = html.indexOf('>');
    expect(root.child!.openTagEnd).toBe(idx);
  });

  it('openTagEnd: <div>s</div> 记录 s 前的 > 的 index', () => {
    const html = '<div>s</div>';
    const root = parse(html);
    // <div> 的 > 位于 's' 之前
    const idx = html.indexOf('>');
    expect(root.child!.openTagEnd).toBe(idx);
  });

  it('openTagEnd: 带属性的标签记录正确的 > index', () => {
    const html = '<div id="x" class="y">text</div>';
    const root = parse(html);
    const idx = html.indexOf('>');
    expect(root.child!.openTagEnd).toBe(idx);
  });

  it('openTagEnd: text 节点不应有 openTagEnd', () => {
    const root = parse('<p>hello</p>');
    const textNode = root.child!.child!;
    expect(textNode.type).toBe('text');
    expect(textNode.openTagEnd).toBeUndefined();
  });
});
