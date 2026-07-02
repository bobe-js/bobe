import { describe, it, expect } from 'vitest';
import { Store, flushMicroEffectManual } from 'aoye';
import { customRender, bobe } from '#/render';

(globalThis as any).window = globalThis;

// ============================================================
// Mock DOM helpers (与 terp.test.ts 保持一致)
// ============================================================

function removeFromAnyParent(root: any, node: any): boolean {
  function walk(p: any): boolean {
    const idx = p.children.indexOf(node);
    if (idx !== -1) {
      p.children.splice(idx, 1);
      return true;
    }
    for (const c of p.children) {
      if (walk(c)) return true;
    }
    return false;
  }
  return walk(root);
}

function setupMock(extraOption: Record<string, any> = {}) {
  const root: any = { name: 'root', children: [] };

  const render = customRender({
    createNode(name) {
      if (name === 'text') {
        const n: any = { name: '#text', props: {}, children: [], textContent: '', nextSibling: null };
        return n;
      }
      return { name, props: {} as Record<string, any>, children: [] as any[], nextSibling: null, firstChild: null };
    },
    setProp(node, key, value) {
      if (key === 'children') {
        node.textContent = String(value);
      } else if (key.startsWith('on')) {
        node[key] = value;
      } else {
        node.props[key] = value;
      }
    },
    insertAfter(parent: any, node: any, prev: any) {
      removeFromAnyParent(root, node);
      const list = parent.children;
      if (!prev) {
        list.unshift(node);
        node.nextSibling = parent.firstChild;
        parent.firstChild = node;
      } else {
        const idx = list.indexOf(prev);
        list.splice(idx + 1, 0, node);
        node.nextSibling = prev.nextSibling;
        prev.nextSibling = node;
      }
    },
    createAnchor(name) {
      return { name: `<!--${name}-->`, children: [], props: {}, _anchor: true };
    },
    remove(node: any) {
      removeFromAnyParent(root, node);
    },
    firstChild(node) {
      return node.firstChild || null;
    },
    nextSib(node) {
      return node.nextSibling || null;
    },
    ...extraOption
  });

  return { root, render };
}

function flushEffects() {
  flushMicroEffectManual();
}

function mustFind(root: any, id: string): any {
  function walk(node: any): any {
    if (node.props && node.props.id === id) return node;
    for (const c of node.children) {
      const found = walk(c);
      if (found) return found;
    }
    return null;
  }
  const node = walk(root);
  if (!node) throw new Error(`Node with id="${id}" not found`);
  return node;
}

function getMockTree(node: any): any {
  if (node._anchor) return null;
  if (node.name === '#text') return { t: node.textContent || node.text || '' };
  const tag: any = {
    tag: node.name,
    props: node.props,
    children: node.children.map(getMockTree).filter(Boolean)
  };
  if (node.textContent || node.text) {
    tag.t = node.textContent || node.text;
  }
  return tag;
}

function findSpanText(root: any, text: string): any {
  function walk(node: any): any {
    if (node.textContent === text || node.t === text) return node;
    for (const c of node.children || []) {
      const found = walk(c);
      if (found) return found;
    }
    return null;
  }
  return walk(root);
}

// ============================================================
// For 专用 helpers
// ============================================================

/** 获取容器下所有非锚点子项的文本内容（按 DOM 顺序） */
function getItemTexts(root: any, containerId?: string): string[] {
  const tree = getMockTree(root);
  // 无 containerId 时，找 root 下第一个 div 作为容器
  const container = containerId
    ? getMockTree(mustFind(root, containerId))
    : tree.children.find((c: any) => c.tag === 'div') || tree;
  return container.children.map((c: any) => c.t).filter((t: any) => t !== undefined);
}

/** 获取容器下所有非锚点子项的 id prop（按 DOM 顺序） */
function getItemIds(root: any, containerId?: string): string[] {
  const tree = getMockTree(root);
  const container = containerId
    ? getMockTree(mustFind(root, containerId))
    : tree.children.find((c: any) => c.tag === 'div') || tree;
  return container.children.map((c: any) => c.props?.id).filter((id: any) => id !== undefined);
}

/** 获取原始 DOM 中第一个 div 下的非锚点子节点（用于引用对比） */
function getRawItems(root: any): any[] {
  const div = root.children.find((c: any) => c.name && !c._anchor);
  if (!div) return [];
  return (div.children || []).filter((c: any) => !c._anchor);
}

/** 检查 DOM 树中是否包含指定名称的锚点 */
function hasAnchor(root: any, anchorName: string): boolean {
  function walk(node: any): boolean {
    if (node._anchor && typeof node.name === 'string' && node.name.includes(anchorName)) return true;
    for (const c of node.children || []) {
      if (walk(c)) return true;
    }
    return false;
  }
  return walk(root);
}

/** 统计 DOM 树中指定名称的锚点数量 */
function countAnchors(root: any, anchorName: string): number {
  let count = 0;
  function walk(node: any) {
    if (node._anchor && typeof node.name === 'string' && node.name.includes(anchorName)) count++;
    for (const c of node.children || []) {
      walk(c);
    }
  }
  walk(root);
  return count;
}

// ============================================================
// 基本渲染
// ============================================================

describe('for 循环 — 基本渲染', () => {
  it('渲染数组', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['1', '2', '3']);
  });

  it('空数组不渲染子项', () => {
    class App extends Store {
      arr: any[] = [];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual([]);
  });

  it('单个元素', () => {
    class App extends Store {
      arr = [42];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['42']);
  });

  it('Map 集合', () => {
    class App extends Store {
      map = new Map([
        ['a', 1],
        ['b', 2]
      ]);
      ui = bobe`
        div
          for map; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['1', '2']);
  });

  it('Set 集合', () => {
    class App extends Store {
      set = new Set([10, 20]);
      ui = bobe`
        div
          for set; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['10', '20']);
  });

  it('数字 N → 长度为 N 的数组', () => {
    class App extends Store {
      count = 3;
      ui = bobe`
        div
          for count; item i
            span children={i}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['0', '1', '2']);
  });

  it('字符串 → 字符数组', () => {
    class App extends Store {
      str = 'ab';
      ui = bobe`
        div
          for str; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['a', 'b']);
  });

  it('index 变量在模板中可访问', () => {
    class App extends Store {
      arr = ['x', 'y', 'z'];
      ui = bobe`
        div
          for arr; item i
            span children={i}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemTexts(root)).toEqual(['0', '1', '2']);
  });

  it('for 后有兄弟节点', () => {
    class App extends Store {
      arr = [1, 2];
      ui = bobe`
        div
          for arr; item i
            span children={item}
          span children="tail"
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const texts = getItemTexts(root);
    expect(texts).toContain('1');
    expect(texts).toContain('2');
    expect(texts).toContain('tail');
    expect(texts[texts.length - 1]).toBe('tail');
  });
});

// ============================================================
// 无 key 列表更新
// ============================================================

describe('for 循环 — 无 key 更新', () => {
  it('尾部新增', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2, 3, 4, 5];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('尾部删除', () => {
    class App extends Store {
      arr = [1, 2, 3, 4, 5];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2, 3];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3']);
  });

  it('复用已有项（数据变更，长度不变）', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const rawItems = getRawItems(root);
    expect(rawItems.length).toBe(3);

    store.arr = [10, 20, 30];
    flushEffects();

    const rawItems2 = getRawItems(root);
    // DOM 节点应复用（引用相同），仅文本变化
    expect(rawItems2[0]).toBe(rawItems[0]);
    expect(rawItems2[1]).toBe(rawItems[1]);
    expect(rawItems2[2]).toBe(rawItems[2]);
    expect(getItemTexts(root)).toEqual(['10', '20', '30']);
  });

  it('整体替换数组', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [7, 8];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['7', '8']);
  });

  it('空 → 非空', () => {
    class App extends Store {
      arr: any[] = [];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(getItemTexts(root)).toEqual([]);

    store.arr = [1, 2, 3];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3']);
  });

  it('非空 → 空', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3']);

    store.arr = [];
    flushEffects();

    expect(getItemTexts(root)).toEqual([]);
  });

  it('先增后减', () => {
    class App extends Store {
      arr = [1, 2];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2, 3, 4];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2', '3', '4']);

    store.arr = [1, 2];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2']);
  });

  it('先减后增', () => {
    class App extends Store {
      arr = [1, 2, 3, 4];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2']);

    store.arr = [1, 2, 3, 4, 5];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2', '3', '4', '5']);
  });
});

// ============================================================
// 有 key 列表 — 纯增删
// ============================================================

describe('for 循环 — 有 key 纯增删', () => {
  it('纯尾增', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.list = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
      { id: 'd', v: 4 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'b', 'c', 'd']);
    // 原有节点应复用
    expect(mustFind(root, 'a')).toBeTruthy();
    expect(mustFind(root, 'b')).toBeTruthy();
  });

  it('纯尾删', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');
    const bNode = mustFind(root, 'b');

    store.list = [{ id: 'a', v: 1 }];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a']);
    expect(mustFind(root, 'a')).toBe(aNode);
    expect(findSpanText(root, '2')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();
  });

  it('纯头增', () => {
    class App extends Store {
      list = [
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const bNode = mustFind(root, 'b');

    store.list = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'b', 'c']);
    // 原有节点应复用
    expect(mustFind(root, 'b')).toBe(bNode);
  });

  it('纯头删', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const bNode = mustFind(root, 'b');
    const cNode = mustFind(root, 'c');

    store.list = [
      { id: 'b', v: 2 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['b', 'c']);
    expect(mustFind(root, 'b')).toBe(bNode);
    expect(mustFind(root, 'c')).toBe(cNode);
    expect(findSpanText(root, '1')).toBeFalsy();
  });

  it('头增 + 尾删', () => {
    class App extends Store {
      list = [
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.list = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'b', 'c']);
    expect(findSpanText(root, '4')).toBeFalsy();
  });

  it('头删 + 尾增', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const bNode = mustFind(root, 'b');

    store.list = [
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
      { id: 'd', v: 4 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['b', 'c', 'd']);
    expect(mustFind(root, 'b')).toBe(bNode);
    expect(findSpanText(root, '1')).toBeFalsy();
  });
});

// ============================================================
// 有 key 列表 — 移动
// ============================================================

describe('for 循环 — 有 key 移动', () => {
  it('交换前两项', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      swap = () => {
        this.list = [this.list[1], this.list[0], this.list[2]];
      };
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');
    const bNode = mustFind(root, 'b');
    const cNode = mustFind(root, 'c');

    store.swap();
    flushEffects();

    expect(getItemIds(root)).toEqual(['b', 'a', 'c']);
    // 所有节点应复用，非新建
    expect(mustFind(root, 'a')).toBe(aNode);
    expect(mustFind(root, 'b')).toBe(bNode);
    expect(mustFind(root, 'c')).toBe(cNode);
  });

  it('完全反转', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 }
      ];
      reverse = () => {
        this.list = [...this.list].reverse();
      };
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const nodes = ['a', 'b', 'c', 'd'].map(id => mustFind(root, id));

    store.reverse();
    flushEffects();

    expect(getItemIds(root)).toEqual(['d', 'c', 'b', 'a']);
    ['a', 'b', 'c', 'd'].forEach((id, i) => {
      expect(mustFind(root, id)).toBe(nodes[i]);
    });
  });

  it('中间项移到头部', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');
    const cNode = mustFind(root, 'c');

    // C 移到头部
    store.list = [
      { id: 'c', v: 3 },
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'd', v: 4 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['c', 'a', 'b', 'd']);
    expect(mustFind(root, 'a')).toBe(aNode);
    expect(mustFind(root, 'c')).toBe(cNode);
  });

  it('头部项移到尾部', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');

    // A 移到尾部
    store.list = [
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
      { id: 'd', v: 4 },
      { id: 'a', v: 1 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['b', 'c', 'd', 'a']);
    expect(mustFind(root, 'a')).toBe(aNode);
  });

  it('复杂混合（增 + 删 + 移）', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 },
        { id: 'e', v: 5 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const bNode = mustFind(root, 'b');
    const dNode = mustFind(root, 'd');

    // 删除 a, c; 新增 f, g; 移动 b, d, e
    store.list = [
      { id: 'f', v: 6 },
      { id: 'b', v: 2 },
      { id: 'd', v: 4 },
      { id: 'e', v: 5 },
      { id: 'g', v: 7 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['f', 'b', 'd', 'e', 'g']);
    expect(mustFind(root, 'b')).toBe(bNode);
    expect(mustFind(root, 'd')).toBe(dNode);
    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();
  });

  it('乱序 shuffle', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 },
        { id: 'e', v: 5 },
        { id: 'f', v: 6 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => mustFind(root, id));

    store.list = [
      { id: 'd', v: 4 },
      { id: 'a', v: 1 },
      { id: 'f', v: 6 },
      { id: 'b', v: 2 },
      { id: 'e', v: 5 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['d', 'a', 'f', 'b', 'e', 'c']);
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((id, i) => {
      expect(mustFind(root, id)).toBe(nodes[i]);
    });
  });

  it('全部替换（无复用项）', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.list = [
      { id: 'x', v: 10 },
      { id: 'y', v: 20 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['x', 'y']);
    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '2')).toBeFalsy();
  });
});

// ============================================================
// isItemFirstChildLogic 预检优化
// ============================================================

describe('for 循环 — isItemFirstChildLogic 预检', () => {
  it('首项为普通节点 → 无 contentStart 锚点', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    // 首项是 span（普通节点），不应创建 contentStart 锚点
    expect(hasAnchor(root, 'for-item-content-start')).toBe(false);
  });

  it('首项为逻辑节点 if → 有 contentStart 锚点', () => {
    class App extends Store {
      arr = [1, 2, 3];
      show = true;
      ui = bobe`
        div
          for arr; item i
            if show
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    // 首项是 if（逻辑节点），应创建 contentStart 锚点
    expect(hasAnchor(root, 'for-item-content-start')).toBe(true);
  });

  it('首项为普通节点 → 无 contentStart，但仍有 for-after 锚点', () => {
    class App extends Store {
      arr = [1, 2];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(hasAnchor(root, 'for-item-content-start')).toBe(false);
    // for-after 锚点始终存在
    expect(hasAnchor(root, 'for-after')).toBe(true);
  });

  it('逻辑首项列表更新后仍正确渲染', () => {
    class App extends Store {
      arr = [1, 2, 3];
      show = true;
      ui = bobe`
        div
          for arr; item i
            if show
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '2')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeTruthy();

    // 更新数组
    store.arr = [4, 5];
    flushEffects();

    expect(findSpanText(root, '4')).toBeTruthy();
    expect(findSpanText(root, '5')).toBeTruthy();
    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();
  });

  it('逻辑首项列表新增项时 if 生效', () => {
    class App extends Store {
      arr = [1, 2];
      show = true;
      ui = bobe`
        div
          for arr; item i
            if show
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 尾部新增
    store.arr = [1, 2, 3, 4];
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeTruthy();
    expect(findSpanText(root, '4')).toBeTruthy();

    // 切换 show=false，所有 if 块应消失
    store.show = false;
    flushEffects();

    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();
  });

  it('逻辑首项列表删除项后仍正确渲染', () => {
    class App extends Store {
      arr = [1, 2, 3, 4];
      show = true;
      ui = bobe`
        div
          for arr; item i
            if show
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 尾部删除
    store.arr = [1, 2];
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '2')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeFalsy();
    expect(findSpanText(root, '4')).toBeFalsy();
  });
});

// ============================================================
// 解构语法
// ============================================================

describe('for 循环 — 解构语法', () => {
  it('解构 + key', () => {
    class App extends Store {
      list = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' }
      ];
      ui = bobe`
        div
          for list; { id, name } i; id
            span id={id} children={name}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(getItemIds(root)).toEqual(['a', 'b']);
    expect(findSpanText(root, 'Alice')).toBeTruthy();
    expect(findSpanText(root, 'Bob')).toBeTruthy();
  });

  it('解构无 key', () => {
    class App extends Store {
      list = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' }
      ];
      ui = bobe`
        div
          for list; { id, name } i
            span children={name}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(findSpanText(root, 'Alice')).toBeTruthy();
    expect(findSpanText(root, 'Bob')).toBeTruthy();
  });

  it('解构 + key 更新后复用节点', () => {
    class App extends Store {
      list = [
        { id: 'a', name: 'Alice' },
        { id: 'b', name: 'Bob' }
      ];
      ui = bobe`
        div
          for list; { id, name } i; id
            span id={id} children={name}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');

    store.list = [
      { id: 'b', name: 'Bob' },
      { id: 'a', name: 'Alice' }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['b', 'a']);
    expect(mustFind(root, 'a')).toBe(aNode);
  });
});

// ============================================================
// 嵌套场景
// ============================================================

describe('for 循环 — 嵌套场景', () => {
  it('嵌套 for', () => {
    class App extends Store {
      rows = [
        { cols: [1, 2] },
        { cols: [3, 4] }
      ];
      ui = bobe`
        div
          for rows; row i
            div
              for row.cols; col j
                span children={col}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);

    const tree = getMockTree(root);
    const outerDiv = tree.children[0];
    expect(outerDiv.tag).toBe('div');
    // 两行
    expect(outerDiv.children.length).toBe(2);
    // 第一行有两个 span
    const row1 = outerDiv.children[0];
    expect(row1.children.length).toBe(2);
    expect(row1.children[0].t).toBe('1');
    expect(row1.children[1].t).toBe('2');
    // 第二行有两个 span
    const row2 = outerDiv.children[1];
    expect(row2.children.length).toBe(2);
    expect(row2.children[0].t).toBe('3');
    expect(row2.children[1].t).toBe('4');
  });

  it('嵌套 for 更新内层', () => {
    class App extends Store {
      rows = [
        { cols: [1, 2] },
        { cols: [3, 4] }
      ];
      ui = bobe`
        div
          for rows; row i
            div
              for row.cols; col j
                span children={col}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 更新第一行的 cols
    store.rows = [
      { cols: [5, 6, 7] },
      { cols: [3, 4] }
    ];
    flushEffects();

    const tree = getMockTree(root);
    const outerDiv = tree.children[0];
    const row1 = outerDiv.children[0];
    expect(row1.children.length).toBe(3);
    expect(row1.children[0].t).toBe('5');
    expect(row1.children[2].t).toBe('7');
  });

  it('for 内嵌 if（逻辑首项）', () => {
    class App extends Store {
      arr = [1, 2, 3];
      show = true;
      ui = bobe`
        div
          for arr; item i
            if show
              span children={item}
            span children="suffix"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, 'suffix')).toBeTruthy();

    // 关闭 if
    store.show = false;
    flushEffects();

    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, 'suffix')).toBeTruthy();

    // 重新打开
    store.show = true;
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, 'suffix')).toBeTruthy();
  });

  it('if 内嵌 for', () => {
    class App extends Store {
      show = true;
      arr = [1, 2, 3];
      ui = bobe`
        div
          if show
            for arr; item i
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3']);

    store.show = false;
    flushEffects();
    expect(getItemTexts(root)).toEqual([]);

    store.show = true;
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2', '3']);
  });

  it('if 内嵌 for 交替切换', () => {
    class App extends Store {
      show = true;
      arr = [1, 2];
      ui = bobe`
        div
          if show
            for arr; item i
              span children={item}
          span children="after"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, 'after')).toBeTruthy();

    // 切换数据后关闭
    store.arr = [3, 4, 5];
    store.show = false;
    flushEffects();

    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, 'after')).toBeTruthy();

    // 重新打开，应有新数据
    store.show = true;
    flushEffects();

    expect(findSpanText(root, '3')).toBeTruthy();
    expect(findSpanText(root, '5')).toBeTruthy();
    expect(findSpanText(root, '1')).toBeFalsy();
  });

  it('tp 内嵌 for，传送后内容在目标节点中', () => {
    class App extends Store {
      tpTarget: any = null;
      refA: any = null;
      list = [1, 2, 3];
      ui = bobe`
        div
          div ref={refA}
          tp node={tpTarget}
            for list; item i
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // tpTarget=null，for 内容不可见
    expect(findSpanText(root, '1')).toBeFalsy();

    // 传送到 refA
    store.tpTarget = store.refA;
    flushEffects();
    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '2')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeTruthy();

    // 验证内容确实在 refA 内
    const refATree = getMockTree(store.refA);
    expect(JSON.stringify(refATree)).toContain('1');
    expect(JSON.stringify(refATree)).toContain('3');

    // 清空 tpTarget，内容移除
    store.tpTarget = null;
    flushEffects();
    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '2')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();
  });

  it('tp 内嵌 for，移动目标后 for 仍存活并可更新', () => {
    class App extends Store {
      tpTarget: any = null;
      refA: any = null;
      refB: any = null;
      list = [1, 2, 3];
      ui = bobe`
        div
          div ref={refA}
          div ref={refB}
          tp node={tpTarget}
            for list; item i
              span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 传送到 refA
    store.tpTarget = store.refA;
    flushEffects();
    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeTruthy();
    expect(JSON.stringify(getMockTree(store.refA))).toContain('1');

    // 切换到 refB（触发 tp 移动）
    store.tpTarget = store.refB;
    flushEffects();
    expect(findSpanText(root, '1')).toBeTruthy();
    expect(findSpanText(root, '3')).toBeTruthy();
    expect(JSON.stringify(getMockTree(store.refB))).toContain('1');
    // refA 下不应再有 for 内容
    expect(JSON.stringify(getMockTree(store.refA))).not.toContain('1');

    // 移动后更新 list，验证 for effect 未被销毁
    store.list = [4, 5];
    flushEffects();
    expect(findSpanText(root, '4')).toBeTruthy();
    expect(findSpanText(root, '5')).toBeTruthy();
    expect(findSpanText(root, '1')).toBeFalsy();
    expect(findSpanText(root, '3')).toBeFalsy();

    // 再次移动回 refA
    store.tpTarget = store.refA;
    flushEffects();
    expect(findSpanText(root, '4')).toBeTruthy();
    expect(findSpanText(root, '5')).toBeTruthy();
    expect(JSON.stringify(getMockTree(store.refA))).toContain('4');
    expect(JSON.stringify(getMockTree(store.refB))).not.toContain('4');
  });

  it('tp 内嵌 keyed for，传送后 key 复用正常', () => {
    class App extends Store {
      tpTarget: any = null;
      refA: any = null;
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 }
      ];
      ui = bobe`
        div
          div ref={refA}
          tp node={tpTarget}
            for list; { id, v } i; id
              span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 传送到 refA
    store.tpTarget = store.refA;
    flushEffects();

    const aNode = mustFind(root, 'a');
    const bNode = mustFind(root, 'b');

    // 交换顺序（keyed move）
    store.list = [
      { id: 'b', v: 2 },
      { id: 'a', v: 1 }
    ];
    flushEffects();

    expect(mustFind(root, 'a')).toBe(aNode);
    expect(mustFind(root, 'b')).toBe(bNode);

    // 内容仍在 refA 中
    expect(JSON.stringify(getMockTree(store.refA))).toContain('1');
    expect(JSON.stringify(getMockTree(store.refA))).toContain('2');
  });
});

// ============================================================
// 边界情况
// ============================================================

describe('for 循环 — 边界情况', () => {
  it('单项 → 多项（无 key）', () => {
    class App extends Store {
      arr = [1];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2, 3];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1', '2', '3']);
  });

  it('多项 → 单项（无 key）', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1];
    flushEffects();

    expect(getItemTexts(root)).toEqual(['1']);
  });

  it('keyed 单项替换', () => {
    class App extends Store {
      list = [{ id: 'a', v: 1 }];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.list = [{ id: 'b', v: 2 }];
    flushEffects();

    expect(getItemIds(root)).toEqual(['b']);
    expect(findSpanText(root, '1')).toBeFalsy();
  });

  it('keyed 单项 → 多项', () => {
    class App extends Store {
      list = [{ id: 'a', v: 1 }];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');

    store.list = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'b', 'c']);
    expect(mustFind(root, 'a')).toBe(aNode);
  });

  it('大列表重排', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      v: i
    }));
    class App extends Store {
      list = data;
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 记录部分节点引用
    const node0 = mustFind(root, 'id-0');
    const node25 = mustFind(root, 'id-25');
    const node49 = mustFind(root, 'id-49');

    // 反转
    store.list = [...data].reverse();
    flushEffects();

    const ids = getItemIds(root);
    expect(ids[0]).toBe('id-49');
    expect(ids[49]).toBe('id-0');
    expect(mustFind(root, 'id-0')).toBe(node0);
    expect(mustFind(root, 'id-25')).toBe(node25);
    expect(mustFind(root, 'id-49')).toBe(node49);
  });

  it('连续多次更新', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    store.arr = [1, 2, 3, 4];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2', '3', '4']);

    store.arr = [1, 2];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['1', '2']);

    store.arr = [5, 6, 7, 8, 9];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['5', '6', '7', '8', '9']);

    store.arr = [];
    flushEffects();
    expect(getItemTexts(root)).toEqual([]);

    store.arr = [10];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['10']);
  });

  it('keyed 项内属性更新', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const aNode = mustFind(root, 'a');

    // 更新项的数据（key 不变）
    store.list = [
      { id: 'a', v: 100 },
      { id: 'b', v: 200 }
    ];
    flushEffects();

    // 同 key 应复用节点
    expect(mustFind(root, 'a')).toBe(aNode);
    expect(findSpanText(root, '100')).toBeTruthy();
    expect(findSpanText(root, '200')).toBeTruthy();
    expect(findSpanText(root, '1')).toBeFalsy();
  });

  it('keyed 删除中间项后顺序正确', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
        { id: 'd', v: 4 },
        { id: 'e', v: 5 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 删除 b, d
    store.list = [
      { id: 'a', v: 1 },
      { id: 'c', v: 3 },
      { id: 'e', v: 5 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'c', 'e']);
    expect(findSpanText(root, '2')).toBeFalsy();
    expect(findSpanText(root, '4')).toBeFalsy();
  });

  it('keyed 删除中间项 + 新增', () => {
    class App extends Store {
      list = [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 }
      ];
      ui = bobe`
        div
          for list; { id, v } i; id
            span id={id} children={v}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 删除 b，新增 d 放在 b 的位置
    store.list = [
      { id: 'a', v: 1 },
      { id: 'd', v: 4 },
      { id: 'c', v: 3 }
    ];
    flushEffects();

    expect(getItemIds(root)).toEqual(['a', 'd', 'c']);
    expect(findSpanText(root, '2')).toBeFalsy();
    expect(findSpanText(root, '4')).toBeTruthy();
  });

  it('for 后无兄弟节点时 for-after 锚点正确', () => {
    class App extends Store {
      arr = [1, 2];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    expect(hasAnchor(root, 'for-after')).toBe(true);
    expect(getItemTexts(root)).toEqual(['1', '2']);
  });

  it('无 key 列表更新后 for effect 仍存活', () => {
    class App extends Store {
      arr = [1, 2];
      ui = bobe`
        div
          for arr; item i
            span children={item}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 多次更新
    store.arr = [3, 4];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['3', '4']);

    store.arr = [5];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['5']);

    store.arr = [6, 7, 8];
    flushEffects();
    expect(getItemTexts(root)).toEqual(['6', '7', '8']);
  });
});
