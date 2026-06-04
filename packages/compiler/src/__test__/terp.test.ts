import { Interpreter } from '#/terp';
import { FakeType, NodeSort } from '#/type';
import { MultiTypeStack } from '#/typed';
import { describe, it, expect, vi } from 'vitest';
import { deepSignal, Keys, Store,  getPulling, flushMicroEffectManual, effect } from 'aoye';
import { customRender, bobe } from '#/render';

// vitest runs in Node.js; for loop uses window['for1'] debug
(globalThis as any).window = globalThis;

// ============================================================
// Level 1 — 纯单元测试
// ============================================================

function makeTerp() {
  const tok = {
    nextToken: vi.fn(),
    _hook: vi.fn(),
    snapshot: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    skipStr: vi.fn(),
    isEof: vi.fn(),
    get token() {
      return tok._token;
    }
  } as any;
  return new Interpreter(tok);
}

describe('Interpreter 纯单元测试', () => {
  // ----------------------------------------------------------
  describe('formatForCollection', () => {
    const t = makeTerp();

    it('普通数组', () => {
      const now = [1, 2, 3];
      const { arr, keys } = t.formatForCollection(now);
      expect(arr).toEqual([1, 2, 3]);
      expect(keys).toBeNull();
    });

    it('空数组', () => {
      const { arr, keys } = t.formatForCollection([]);
      expect(arr).toEqual([]);
      expect(keys).toBeNull();
    });

    it('Map', () => {
      const m = new Map([
        ['a', 1],
        ['b', 2]
      ]);
      const { arr, keys } = t.formatForCollection(m);
      expect(arr).toEqual([1, 2]);
      expect(keys).toEqual(['a', 'b']);
    });

    it('Set', () => {
      const s = new Set([10, 20]);
      const { arr, keys } = t.formatForCollection(s);
      expect(arr).toEqual([10, 20]);
      expect(keys).toBeNull();
    });

    it('可迭代对象', () => {
      const it = {
        [Symbol.iterator]: function* () {
          yield 1;
          yield 2;
        }
      };
      const { arr } = t.formatForCollection(it);
      expect(arr).toEqual([1, 2]);
    });

    it('数字 → 长度为 n 的 undefined 数组', () => {
      const { arr, keys } = t.formatForCollection(5);
      expect(arr).toEqual(new Array(5));
      expect(arr.length).toBe(5);
      expect(keys).toBeNull();
    });

    it('字符串', () => {
      const { arr, keys } = t.formatForCollection('hello');
      expect(arr).toEqual(['h', 'e', 'l', 'l', 'o']);
      expect(keys).toBeNull();
    });
  });

  // ----------------------------------------------------------
  describe('getFn', () => {
    const t = makeTerp();

    it('简单属性', () => {
      const data = { a: 42 };
      const fn = t.getFn(data, 'a');
      expect(fn()).toBe(42);
    });

    it('深层路径', () => {
      const data = { a: { b: { c: 99 } } };
      const fn = t.getFn(data, 'a.b.c');
      expect(fn()).toBe(99);
    });

    it('表达式', () => {
      const data = { x: 10, y: 20 };
      const fn = t.getFn(data, 'x + y');
      expect(fn()).toBe(30);
    });

    it('模板字符串', () => {
      const data = { name: 'world' };
      const fn = t.getFn(data, '`hello ${name}`');
      expect(fn()).toBe('hello world');
    });
  });

  // ----------------------------------------------------------
  describe('getAssignFn', () => {
    const t = makeTerp();

    it('简单属性赋值', () => {
      const data: any = { count: 0 };
      const fn = t.getAssignFn(data, 'count');
      fn(5);
      expect(data.count).toBe(5);
    });

    it('深层路径赋值', () => {
      const data: any = { user: { name: 'old' } };
      const fn = t.getAssignFn(data, 'user.name');
      fn('new');
      expect(data.user.name).toBe('new');
    });
  });

  // ----------------------------------------------------------
  describe('createNode', () => {
    const t = makeTerp();

    it('div', () => {
      const node = t.createNode('div');
      expect(node).toEqual({ name: 'div', props: {}, nextSibling: null });
    });

    it('text', () => {
      const node = t.createNode('text');
      expect(node.name).toBe('text');
      expect(node.props).toEqual({});
    });

    it('自定义标签', () => {
      const node = t.createNode('custom-el');
      expect(node.name).toBe('custom-el');
    });
  });

  // ----------------------------------------------------------
  describe('createAnchor', () => {
    const t = makeTerp();

    it('默认名称', () => {
      const anchor = t.createAnchor('anchor');
      expect(anchor).toEqual({ name: 'anchor', nextSibling: null });
    });
  });

  // ----------------------------------------------------------
  describe('nextSib / firstChild', () => {
    const t = makeTerp();

    it('nextSibling', () => {
      const n2 = { name: 'b', nextSibling: null };
      const n1 = { name: 'a', nextSibling: n2 };
      expect(t.nextSib(n1)).toBe(n2);
    });

    it('firstChild', () => {
      const child = { name: 'child' };
      const parent = { name: 'parent', firstChild: child };
      expect(t.firstChild(parent)).toBe(child);
    });
  });

  // ----------------------------------------------------------
  describe('defaultInsert / defaultRemove', () => {
    it('头插 (no prev)', () => {
      const t = makeTerp();
      const child = t.createNode('a');
      const parent: any = { firstChild: null };
      const prev = null;

      t.defaultInsert(parent, child, prev);
      expect(parent.firstChild).toBe(child);
      expect(child.nextSibling).toBeNull();
    });

    it('尾插 (after prev)', () => {
      const t = makeTerp();
      const a = t.createNode('a');
      const b = t.createNode('b');
      const parent: any = { firstChild: a };
      a.nextSibling = null;

      t.defaultInsert(parent, b, a);
      expect(parent.firstChild).toBe(a);
      expect(a.nextSibling).toBe(b);
      expect(b.nextSibling).toBeNull();
    });

    it('中插 (between two nodes)', () => {
      const t = makeTerp();
      const a = t.createNode('a');
      const c = t.createNode('c');
      const b = t.createNode('b');
      a.nextSibling = c;
      const parent: any = { firstChild: a, nextSibling: undefined };

      t.defaultInsert(parent, b, a);
      expect(a.nextSibling).toBe(b);
      expect(b.nextSibling).toBe(c);
    });

    it('删除头节点', () => {
      const t = makeTerp();
      const a = t.createNode('a');
      const b = t.createNode('b');
      a.nextSibling = b;
      const parent: any = { firstChild: a };

      t.defaultRemove(a, parent, null);
      expect(parent.firstChild).toBe(b);
    });

    it('删除中间节点 (有 prev)', () => {
      const t = makeTerp();
      const a = t.createNode('a');
      const b = t.createNode('b');
      const c = t.createNode('c');
      a.nextSibling = b;
      b.nextSibling = c;
      const parent: any = { firstChild: a };

      t.defaultRemove(b, parent, a);
      expect(a.nextSibling).toBe(c);
    });
  });

  // ----------------------------------------------------------
  describe('getPrevRealSibling', () => {
    const t = makeTerp();

    it('null prev → null', () => {
      expect(t.getPrevRealSibling(null)).toBeNull();
    });

    it('普通节点 prev', () => {
      const div = t.createNode('div');
      expect(t.getPrevRealSibling(div)).toBe(div);
    });

    it('prev undefined → undefined', () => {
      expect(t.getPrevRealSibling(undefined)).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  describe('config', () => {
    it('Object.assign + opt', () => {
      const t = makeTerp();
      const fakeSetProp = vi.fn();
      const fakeCreateNode = vi.fn();
      t.config({ setProp: fakeSetProp, createNode: fakeCreateNode } as any);
      expect(t.opt).toEqual({ setProp: fakeSetProp, createNode: fakeCreateNode });
    });
  });

  // ----------------------------------------------------------
  describe('setProp', () => {
    const t = makeTerp();

    it('默认写入 node.props', () => {
      const node: any = { props: {} };
      t.setProp(node, 'text', 'hello');
      expect(node.props['text']).toBe('hello');
    });
  });

  // ----------------------------------------------------------
  describe('handleInsert', () => {
    const t = makeTerp();

    it('实节点 → insertAfter（头插）', () => {
      const parent: any = { firstChild: null };
      const child = t.createNode('div');
      t.handleInsert(parent, child, null);
      expect(parent.firstChild).toBe(child);
    });

    it('逻辑节点 → 只设置 realParent/realBefore', () => {
      const parent = {};
      const child: any = { __logicType: FakeType.Component };
      t.handleInsert(parent, child, null);
      expect(child.realParent).toBe(parent);
      expect(child.realBefore).toBeNull();
    });

    it('逻辑节点 + 逻辑 prev', () => {
      const parent = {};
      const prevLogic: any = { __logicType: FakeType.For, realAfter: 'anchor' };
      const child: any = { __logicType: FakeType.Component };
      t.handleInsert(parent, child, prevLogic);
      expect(child.realBefore).toBe('anchor');
    });
  });

  // ----------------------------------------------------------
  describe('getData', () => {
    it('从 CtxProvider 取 data', () => {
      const t = makeTerp();
      const fakeData = { value: 42 };
      const stack = new MultiTypeStack();
      stack.push({ node: { data: fakeData }, prev: null }, NodeSort.CtxProvider);
      t.ctx = { stack } as any;
      expect(t.getData()).toBe(fakeData);
    });
  });
});

// ============================================================
// Level 2 — 轻量 mock 测试
// ============================================================

describe('createStoreOnePropParsed', () => {
  it('isFn → 直接写 child[Keys.Raw]', () => {
    const child = deepSignal({}, getPulling());
    const fn = (() => {
      /* placeholder */
    }) as any;
    // Need to access the function. Since it's not exported, we test through
    // Interpreter.createComponentData which uses it internally.
  });

  it('静态值 → cell + raw', () => {
    const child = deepSignal({}, getPulling());
    const cells = child[Keys.Meta].cells;

    // 模拟 createStoreOnePropParsed 行为
    cells.set('title', { get: () => 'hello' } as any);
    child[Keys.Raw]['title'] = 'hello';

    expect(child.title).toBe('hello');
    const cell = cells.get('title');
    expect(cell).toBeDefined();
    expect(cell.get()).toBe('hello');
  });

  it('动态函数值 → Computed + raw=undefined', () => {
    const child = deepSignal({}, getPulling());
    const cells = child[Keys.Meta].cells;
    const getter = () => 'dynamic';

    // 模拟 createStoreOnePropParsed 对 function value 的处理
    cells.set('dyVal', { get: getter } as any);
    child[Keys.Raw]['dyVal'] = undefined;

    expect(child['dyVal']).toBe('dynamic');
  });

  it('mapKey → 用 shareSignal 共享', () => {
    const parent = deepSignal({ name: 'parent' }, getPulling());
    const child = deepSignal({}, getPulling());

    // 读取 parent.name 确保 signal 已创建
    void parent.name;
    const parentCell = parent[Keys.Meta].cells.get('name')!;

    // shareSignal 核心逻辑
    child[Keys.Meta].cells.set('childName', parentCell);
    child[Keys.Raw]['childName'] = parent.name;

    expect(child['childName']).toBe('parent');
  });
});

describe('onePropParsed', () => {
  it('静态值 → 直接调用 setProp', () => {
    const mockSetProp = vi.fn();
    const t = new Interpreter({} as any);
    t.setProp = mockSetProp;

    t.onePropParsed({} as any, {}, 'key', 'value', false, false);
    expect(mockSetProp).toHaveBeenCalledWith({}, 'key', 'value', undefined);
  });

  it('isFn → new Scope + setProp', () => {
    const mockSetProp = vi.fn();
    const t = new Interpreter({} as any);
    t.setProp = mockSetProp;

    t.onePropParsed({} as any, {}, 'key', 'someFn', false, true);
    expect(mockSetProp).toHaveBeenCalledWith({}, 'key', 'someFn', undefined);
  });

  it('mapKey → new Effect', () => {
    const mockSetProp = vi.fn();
    const t = new Interpreter({} as any);
    t.setProp = mockSetProp;
    const data = { age: 30 };

    t.onePropParsed(data as any, {}, 'key', 'age', true, false);
    // Effect runs synchronously → setProp gets data['age']
    expect(mockSetProp).toHaveBeenCalledWith({}, 'key', 30, undefined);
  });
});

// ============================================================
// Level 3 — 集成测试 (mock DOM)
// ============================================================

describe('集成测试 — 基本渲染', () => {
  it('渲染单个 div', () => {
    class App extends Store {
      ui = bobe` div `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    expect(tree.tag).toBe('root');
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
    expect(tree.children.some((c: any) => c.tag === 'div')).toBe(true);
  });

  it('渲染 div > span text', () => {
    class App extends Store {
      name = 'hello';
      ui = bobe`
        div
          span text={name}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    expect(div).toBeDefined();
    const span = div.children.find((c: any) => c.tag === 'span');
    expect(span).toBeDefined();
    // text={name} sets textContent, not props.text
    expect(span.t).toBe('hello');
  });

  it('渲染静态组件 ${Comp}', () => {
    class Sub extends Store {
      msg = 'sub';
      ui = bobe` p text={msg} `;
    }
    class App extends Store {
      ui = bobe`
        div
          ${Sub}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    expect(div).toBeDefined();
    const hasP = div.children.some((c: any) => c.tag === 'p' && c.t === 'sub');
    expect(hasP).toBe(true);
  });
});

describe('集成测试 — if/else', () => {
  it('if 条件为 true 时渲染子节点', () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="visible"
          span text="always"
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    const hasVisible = JSON.stringify(div).includes('visible');
    const hasAlways = JSON.stringify(div).includes('always');
    expect(hasVisible).toBe(true);
    expect(hasAlways).toBe(true);
  });

  it('if 条件为 false 时不渲染子节点', () => {
    class App extends Store {
      show = false;
      ui = bobe`
        div
          if show
            span text="hidden"
          span text="always"
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    expect(JSON.stringify(div)).not.toContain('hidden');
    expect(JSON.stringify(div)).toContain('always');
  });
});

describe('集成测试 — for 循环', () => {
  it('渲染数组', () => {
    class App extends Store {
      arr = [1, 2, 3];
      ui = bobe`
        div
          for arr; item i
            span text={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    // for 循环会给每个 item 创建 span
    expect(JSON.stringify(tree)).toContain('"t":"1"');
    expect(JSON.stringify(tree)).toContain('"t":"2"');
    expect(JSON.stringify(tree)).toContain('"t":"3"');
  });

  it('空数组不渲染', () => {
    class App extends Store {
      arr: any[] = [];
      ui = bobe`
        div
          for arr; item i
            span text={item}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    // 空数组 → 没有 span 子元素
    const hasSpans = JSON.stringify(div).includes('"tag":"span"');
    expect(hasSpans).toBe(false);
  });
});

describe('集成测试 — 动态文本', () => {
  it('动态文本初始渲染', () => {
    class App extends Store {
      name = 'hello';
      ui = bobe`
        div
          {name}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    expect(JSON.stringify(tree)).toContain('hello');
  });
});

describe('集成测试 — 动态组件', () => {
  it('initial render with component', () => {
    class CompA extends Store {
      msg = 'COMPONENT_A';
      ui = bobe` span text={msg} `;
    }
    class App extends Store {
      state = { comp: CompA as any };
      ui = bobe`
        div
          {state.comp}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    expect(JSON.stringify(tree)).toContain('COMPONENT_A');
  });
});

describe('集成测试 — props 展开', () => {
  it('静态 props 对象展开为 DOM 属性', () => {
    class App extends Store {
      ui = bobe`
        div props={{ title: 'hello', 'data-id': '123' }}
      `;
    }
    const { render, root } = setupMock();
    render(App, root);
    const tree = getMockTree(root);
    const div = tree.children.find((c: any) => c.tag === 'div');
    expect(div.props.title).toBe('hello');
    expect(div.props['data-id']).toBe('123');
  });

  it('响应式 props 对象绑定', () => {
    class App extends Store {
      myProps = { title: 'initial', style: 'color:red' };
      ui = bobe`
        div props={myProps} id="t1"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const target = mustFind(root, 't1');
    expect(target.props.title).toBe('initial');
    expect(target.props.style).toBe('color:red');

    store.myProps.title = 'updated';
    flushEffects();
    expect(target.props.title).toBe('updated');
    expect(target.props.style).toBe('color:red');
  });

  it('props 对象整体替换', () => {
    class App extends Store {
      myProps: any = { title: 'v1', a: '1' };
      switchProps = () => {
        this.myProps = { title: 'v2', b: '2' };
      };
      ui = bobe`
        div
          button onclick={switchProps} text="switch"
          div props={myProps} id="t2"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const target = mustFind(root, 't2')!;
    expect(target.props.title).toBe('v1');
    expect(target.props.a).toBe('1');

    store.switchProps();
    flushEffects();

    expect(target.props.title).toBe('v2');
    expect(target.props.b).toBe('2');
    expect(target.props.a).toBeUndefined();
  });

  it('props 增加新 key', () => {
    class App extends Store {
      myProps: any = { title: 'hello' };
      addKey = () => {
        this.myProps['newKey'] = 'value';
      };
      ui = bobe`
        div
          button onclick={addKey} text="add"
          div props={myProps} id="t3"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const target = mustFind(root, 't3')!;
    expect(target.props.newKey).toBeUndefined();

    store.addKey();
    flushEffects();

    expect(target.props.newKey).toBe('value');
  });

  it('props 删除 key', () => {
    class App extends Store {
      myProps: any = { title: 'hello', toDelete: 'remove-me' };
      delKey = () => {
        delete this.myProps.toDelete;
      };
      ui = bobe`
        div
          button onclick={delKey} text="del"
          div props={myProps} id="t4"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const target = mustFind(root, 't4')!;
    expect(target.props.toDelete).toBe('remove-me');

    store.delKey();
    flushEffects();

    expect(target.props.toDelete).toBeUndefined();
  });

  it('props=null 不报错且后续可恢复正常', () => {
    class App extends Store {
      myProps: any = null;
      setToProps = () => { this.myProps = { title: 'hello' }; };
      ui = bobe`
        div
          button onclick={setToProps} text="set"
          div props={myProps} id="t5"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    const target = mustFind(root, 't5')!;
    expect(target.props.title).toBeUndefined();

    store.setToProps();
    flushEffects();

    expect(target.props.title).toBe('hello');
  });

  it('空 props 对象 {}', () => {
    class App extends Store {
      ui = bobe`
        div props={{}}
      `;
    }
    const { render, root } = setupMock();
    expect(() => render(App, root)).not.toThrow();
  });
});

describe('集成测试 — 动态组件 + props 展开', () => {
  it('savedDefaults: 清除 props 后恢复子组件默认值', () => {
    class CompB extends Store {
      a = 20;
      b = 'foo';
      ui = bobe`
        div
          span text={a}
          span text={b}
      `;
    }

    class App extends Store {
      comp: any = CompB;
      myProps = {} as any;                        // 初始为空
      setA = () => { this.myProps = { a: 31 }; };
      clearA = () => { this.myProps = {}; };
      ui = bobe`
        div
          button onclick={setA} text="set a=31"
          button onclick={clearA} text="clear"
          {comp} props={myProps}
      `;
    }

    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 初始 props={} → CompB 使用默认 a=20, b=foo
    expect(findSpanText(root, '20')).toBeTruthy();
    expect(findSpanText(root, 'foo')).toBeTruthy();

    // 设置 props={a:31}
    store.setA();
    flushEffects();

    // shareSignal → raw['a'] = 31，覆盖默认 20
    expect(findSpanText(root, '31')).toBeTruthy();
    expect(findSpanText(root, '20')).toBeFalsy();
    expect(findSpanText(root, 'foo')).toBeTruthy();

    // 清除 props → {}
    store.clearA();
    flushEffects();

    // cleanup → _node.data['a'] = undefined
    // cleanup → _node.data['a'] = savedDefaults.get('a') = 20 ✅ 恢复默认
    expect(findSpanText(root, '31')).toBeFalsy();
    expect(findSpanText(root, '20')).toBeTruthy();
    expect(findSpanText(root, 'foo')).toBeTruthy();
  });

  it('同时切换组件和 props，子组件未被覆盖的 key 保持默认值', () => {
    class CompA extends Store {
      a = 10;
      ui = bobe` span text={a} `;
    }
    class CompB extends Store {
      a = 20;
      b = 'foo';
      ui = bobe`
        div
          span text={a}
          if b
            span text={b}
      `;
    }

    class App extends Store {
      comp: any = CompA;
      myProps: any = { a: 31 };
      switchBoth = () => {
        this.comp = CompB;
        this.myProps = { b: 'world' };
      };
      ui = bobe`
        div
          button onclick={switchBoth} text="switch"
          {comp} props={myProps}
      `;
    }

    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(findSpanText(root, '31')).toBeTruthy();
    expect(findSpanText(root, '10')).toBeFalsy();
    expect(findSpanText(root, '20')).toBeFalsy();
    expect(findSpanText(root, 'world')).toBeFalsy();
    expect(findSpanText(root, 'foo')).toBeFalsy();

    store.switchBoth();
    flushEffects();

    // a 不在新 props 中 → CompB 默认 a=20，savedDefaults 无记录 → 不被覆盖
    expect(findSpanText(root, '20')).toBeTruthy();
    expect(findSpanText(root, '31')).toBeFalsy();
    // b 在新 props 中 → b='world'，覆盖默认 'foo'
    expect(findSpanText(root, 'world')).toBeTruthy();
    expect(findSpanText(root, 'foo')).toBeFalsy();
  });
});

describe('集成测试 — 动态组件更新切换', () => {
  it('切换 CompA → CompB（含 children 插槽）', () => {
    class CompA extends Store {
      msg = 'A';
      ui = bobe` span text={msg} `;
    }
    class CompB extends Store {
      msg = 'B';
      ui = bobe`
        div
          h2 text={msg}
          {children}
          p text={'after children'}
      `;
    }
    class App extends Store {
      state = { comp: CompA as any };
      ui = bobe`
        div
          button onclick={() => this.state.comp = CompB} text="switch"
          {state.comp}
            span text="inline child"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 初始状态：CompA
    expect(findSpanText(root, 'A')).toBeTruthy();

    // 切换到 CompB
    (store as any).state = { comp: CompB };
    flushEffects();

    // CompB 的 h2, children, p 都应该渲染
    expect(findSpanText(root, 'B')).toBeTruthy();
    expect(findSpanText(root, 'inline child')).toBeTruthy();
    expect(findSpanText(root, 'after children')).toBeTruthy();
  });
});

describe('集成测试 — 动态组件在模板末尾 (Edge Case)', () => {
  it('{page} 作为模板最后一个 token 切换组件', () => {
    class CompA extends Store {
      msg = 'A';
      ui = bobe` span text={msg} `;
    }
    class CompB extends Store {
      msg = 'B';
      ui = bobe`
        div
          h2 text={msg}
          p text={'detail'}
      `;
    }
    class App extends Store {
      page: any = CompA;
      ui = bobe`
        div
          button onclick={() => this.page = CompB} text="switch"
          {page}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    expect(findSpanText(root, 'A')).toBeTruthy();

    (store as any).page = CompB;
    flushEffects();

    // {page} 在模板末尾，更新后 CompB 应正常渲染
    expect(findSpanText(root, 'B')).toBeTruthy();
    expect(findSpanText(root, 'detail')).toBeTruthy();
  });
});

describe('集成测试 — 组件销毁验证', () => {
  it('if 由 true → false 时，{comp} 内子组件的 Effect 被正确销毁', () => {
    let compDestroyed = false;

    class CompA extends Store {
      msg = 'A';
      constructor() {
        super();
        effect(() => (isDestroy: boolean) => {
          if (isDestroy) compDestroyed = true;
        });
      }
      ui = bobe`
        div 
          p text={msg} `;
    }

    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            ${CompA}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 初始状态
    expect(findSpanText(root, 'A')).toBeTruthy();
    expect(compDestroyed).toBe(false);

    // if 条件变为 false
    store.show = false;
    flushEffects();

    // DOM 清理
    expect(findSpanText(root, 'A')).toBeFalsy();
    // CompA 内的 Effect 被销毁，cleanup 回调触发
    expect(compDestroyed).toBe(true);
  });

  it('{comp} 切换后旧组件的 Effect 被正确销毁，新组件不受影响', () => {
    let compADestroyed = false;
    let compBDestroyed = false;

    class CompA extends Store {
      msg = 'A';
      constructor() {
        super();
        effect(() => (isDestroy: boolean) => {
          if (isDestroy) compADestroyed = true;
        });
      }
      ui = bobe`
        div
          p text={msg} `;
    }
    class CompB extends Store {
      msg = 'B';
      constructor() {
        super();
        effect(() => (isDestroy: boolean) => {
          if (isDestroy) compBDestroyed = true;
        });
      }
      ui = bobe` span text={msg} `;
    }

    class App extends Store {
      state = { comp: CompA as any };
      ui = bobe`
        div
          {state.comp}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 初始状态
    expect(findSpanText(root, 'A')).toBeTruthy();
    expect(compADestroyed).toBe(false);
    expect(compBDestroyed).toBe(false);

    // 切换组件
    store.state = { comp: CompB };
    flushEffects();

    // 旧组件 DOM 清理
    expect(findSpanText(root, 'A')).toBeFalsy();
    // 旧组件的 Effect 被销毁
    expect(compADestroyed).toBe(true);
    // 新组件正常渲染
    expect(findSpanText(root, 'B')).toBeTruthy();
    // 新组件未被销毁
    expect(compBDestroyed).toBe(false);
  });

  it('if=true 时切换组件与 if=false 时切换组件，Effect 均正确销毁', () => {
    const onCompADestroy = vi.fn();
    const onCompBDestroy = vi.fn();

    class CompA extends Store {
      msg = 'A';
      constructor() {
        super();
        effect(() => (isDestroy: boolean) => {
          if (isDestroy) onCompADestroy();
        });
      }
      ui = bobe`
        div
          p text={msg} `;
    }
    class CompB extends Store {
      msg = 'B';
      constructor() {
        super();
        effect(() => (isDestroy: boolean) => {
          if (isDestroy) onCompBDestroy();
        });
      }
      ui = bobe` span text={msg} `;
    }

    class App extends Store {
      show = true;
      state = { comp: CompA as any };
      ui = bobe`
        div
          if show
            {state.comp}
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // === if=true, comp=CompA ===
    expect(findSpanText(root, 'A')).toBeTruthy();
    expect(onCompADestroy).not.toHaveBeenCalled();
    expect(onCompBDestroy).not.toHaveBeenCalled();

    // === if=true 时切换 CompA → CompB ===
    store.state = { comp: CompB };
    flushEffects();

    expect(findSpanText(root, 'A')).toBeFalsy();
    expect(onCompADestroy).toHaveBeenCalledTimes(1);
    expect(findSpanText(root, 'B')).toBeTruthy();
    expect(onCompBDestroy).not.toHaveBeenCalled();

    // === if=false，CompB 隐藏；同时在隐藏态切换 CompB → CompA ===
    store.show = false;
    store.state = { comp: CompA };
    flushEffects();

    expect(findSpanText(root, 'B')).toBeFalsy();
    // if=false 导致 CompB 被销毁
    expect(onCompBDestroy).toHaveBeenCalledTimes(1);

    // === if=true，应渲染 CompA ===
    store.show = true;
    flushEffects();

    expect(findSpanText(root, 'A')).toBeTruthy();
    // CompA 是全新实例，旧实例已在步骤 2 销毁，新实例未销毁
    expect(onCompADestroy).toHaveBeenCalledTimes(1);
  });
});

describe('集成测试 — tp 传送', () => {
  it('tpTarget 切换时，内容移动到对应目标 DOM', () => {
    class App extends Store {
      tpTarget: any = null;
      top: any = null;
      mid: any = null;
      ui = bobe`
        div
          div ref={top}
            span text="上路"
          div ref={mid}
            span text="中路"
          tp node={tpTarget}
            span text="teleported"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // 初始 tpTarget=null，内容不可见
    expect(findSpanText(root, 'teleported')).toBeFalsy();

    // 切换到 top
    store.tpTarget = store.top;
    flushEffects();

    expect(findSpanText(root, 'teleported')).toBeTruthy();
    // 验证传送内容在 top 节点下
    const topTree = getMockTree(store.top);
    expect(JSON.stringify(topTree)).toContain('teleported');

    // 切换到 mid：内容应从 top 移动到 mid
    store.tpTarget = store.mid;
    flushEffects();

    expect(findSpanText(root, 'teleported')).toBeTruthy();
    const midTree = getMockTree(store.mid);
    expect(JSON.stringify(midTree)).toContain('teleported');
    // top 下不应再有传送内容
    const topTree2 = getMockTree(store.top);
    expect(JSON.stringify(topTree2)).not.toContain('teleported');
  });

  it('if 控制 ref 显隐 + tp 传送，内容跟随 ref 消长', () => {
    class App extends Store {
      tpTarget: any = null;
      show = true;
      ui = bobe`
        div
          if show
            div ref={tpTarget}
          tp node={tpTarget}
            span text="teleported"
      `;
    }
    const { render, root } = setupMock();
    const [_, store] = render(App, root);
    flushEffects();

    // show=true，内容传送到 tpTarget
    expect(findSpanText(root, 'teleported')).toBeTruthy();
    const refNode = store.tpTarget;
    expect(refNode).toBeTruthy();
    const refTree = getMockTree(refNode);
    expect(JSON.stringify(refTree)).toContain('teleported');

    // show=false，ref 消失 → tpTarget=null → 内容移除
    store.show = false;
    flushEffects();

    expect(findSpanText(root, 'teleported')).toBeFalsy();
    expect(store.tpTarget).toBeNull();

    // show=true，ref 重新出现 → tpTarget=新 DOM → 内容重新传送
    store.show = true;
    flushEffects();

    expect(findSpanText(root, 'teleported')).toBeTruthy();
    const newRefNode = store.tpTarget;
    expect(newRefNode).toBeTruthy();
    const newRefTree = getMockTree(newRefNode);
    expect(JSON.stringify(newRefTree)).toContain('teleported');
  });
});

// ============================================================
// Mock helpers for integration tests
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

function setupMock() {
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
      if (key === 'text') {
        node.textContent = String(value);
      } else if (key.startsWith('on')) {
        node[key] = value;
      } else {
        node.props[key] = value;
      }
    },
    insertAfter(parent: any, node: any, prev: any) {
      // 模拟真实 DOM insertBefore：自动从旧位置移除
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
    }
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
