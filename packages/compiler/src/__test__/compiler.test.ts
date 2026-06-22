/**
 * Compiler 单元测试
 *
 * 从 bobe/compiler 导入，该产物以 __IS_COMPILER__ = true 编译
 */
// @ts-ignore
import { Compiler, Tokenizer, ParseErrorCode } from 'bobe/compiler';
import { describe, it, expect } from 'vitest';

function comp(code: string) {
  const tok = new Tokenizer(() => undefined, false);
  tok.setCode(code);
  return new Compiler(tok);
}

function first(ast: any) { return ast.body[0]; }

// ============================================================
describe('Compiler — 基础元素', () => {
  it('解析空模板', () => {
    expect(comp(' ').parseProgram().body).toHaveLength(0);
  });

  it('解析单个 div', () => {
    expect(first(comp('div').parseProgram()).tagName).toBe('div');
  });

  it('解析多个同级元素（首行有代码）', () => {
    const ast = comp(`span
em
strong`).parseProgram();
    expect(ast.body).toHaveLength(3);
    expect(ast.body[0].tagName).toBe('span');
    expect(ast.body[1].tagName).toBe('em');
    expect(ast.body[2].tagName).toBe('strong');
  });

  it('元素有 loc', () => {
    expect(first(comp('div').parseProgram()).loc).toBeDefined();
  });
});

// ============================================================
describe('Compiler — 属性解析', () => {
  it('字符串属性', () => {
    const p = first(comp('div class="container"').parseProgram()).props[0];
    expect(p.key.key).toBe('class');
    expect(p.value.value).toBe('container');
    expect(p.value.type).toBe('StaticValue');
  });

  it('多个属性', () => {
    expect(first(comp('input type="text" disabled=true').parseProgram()).props).toHaveLength(2);
  });

  it('动态属性 {expr}', () => {
    expect(first(comp('span class={cls}').parseProgram()).props[0].value.type).toBe('DynamicValue');
  });

  it('data-* 属性', () => {
    expect(first(comp('div data-id="123"').parseProgram()).props[0].key.key).toBe('data-id');
  });

  it('布尔属性', () => {
    expect(first(comp('button disabled=true').parseProgram()).props[0].value.value).toBe(true);
  });

  it('事件属性', () => {
    expect(first(comp('button onclick={handler}').parseProgram()).props[0].key.key).toBe('onclick');
  });

  it('属性有 loc', () => {
    const p = first(comp('div class="foo"').parseProgram()).props[0];
    expect(p.loc).toBeDefined();
    expect(p.key.loc).toBeDefined();
    expect(p.value.loc).toBeDefined();
  });
});

// ============================================================
describe('Compiler — children 语法糖', () => {
  it('字符串字面量 "hello"', () => {
    const p = first(comp('div "hello"').parseProgram()).props[0];
    expect(p.key.key).toBe('children');
    expect(p.value.value).toBe('hello');
  });

  it('模板插值 ${name}', () => {
    const p = first(comp('span ${name}').parseProgram()).props[0];
    expect(p.key.key).toBe('children');
  });

  it('动态表达式 {name}（StaticInsExp）', () => {
    const p = first(comp('span {name}').parseProgram()).props[0];
    expect(p.key.key).toBe('children');
  });

  it('children 跟 class 混用', () => {
    const props = first(comp('div "hello" class="greet"').parseProgram()).props;
    expect(props).toHaveLength(2);
    expect(props[0].key.key).toBe('children');
    expect(props[1].key.key).toBe('class');
  });

  it('id 在前 children 在后', () => {
    const props = first(comp('div id="x" "world"').parseProgram()).props;
    expect(props[0].key.key).toBe('id');
    expect(props[1].key.key).toBe('children');
  });

  it('children 糖 Property 有 loc', () => {
    const p = first(comp('div "hello"').parseProgram()).props[0];
    expect(p.loc).toBeDefined();
    expect(p.loc.start.offset).toBeLessThanOrEqual(p.loc.end.offset);
  });
});

// ============================================================
describe('Compiler — 嵌套子元素', () => {
  it('单层嵌套', () => {
    expect(first(comp(`
div
  span`).parseProgram()).children).toHaveLength(1);
  });

  it('多层嵌套', () => {
    const ul = first(comp(`
div
  ul
    li`).parseProgram()).children[0];
    expect(ul.tagName).toBe('ul');
    expect(ul.children[0].tagName).toBe('li');
  });

  it('多个子元素', () => {
    expect(first(comp(`
ul
  li
  li
  li`).parseProgram()).children).toHaveLength(3);
  });

  it('子元素带 children 糖', () => {
    const span = first(comp(`
div
  span "nested"`).parseProgram()).children[0];
    expect(span.props[0].key.key).toBe('children');
  });
});

// ============================================================
describe('Compiler — if/else/fail', () => {
  it('if 节点', () => {
    const n = first(comp(`
if show
  span`).parseProgram());
    expect(n.type).toBe('If');
    expect(n.condition).toBeDefined();
  });

  it('if/else 节点', () => {
    const ast = comp(`
if flag
  span "yes"
else
  span "no"`).parseProgram();
    expect(ast.body[0].type).toBe('If');
    expect(ast.body[1].type).toBe('Else');
  });

  it('if/fail 节点', () => {
    const ast = comp(`
if cond
  span
fail
  span "fb"`).parseProgram();
    expect(ast.body[1].type).toBe('Fail');
  });
});

// ============================================================
describe('Compiler — for 循环', () => {
  it('基础 for', () => {
    const n = first(comp(`
for items; item
  li`).parseProgram());
    expect(n.type).toBe('For');
    expect(n.collection).toBeDefined();
    expect(n.item).toBeDefined();
  });

  it('for 带 index', () => {
    expect(first(comp(`
for items; item i
  li`).parseProgram()).index.value).toBe('i');
  });

  it('for 带 index 和 key', () => {
    const n = first(comp(`
for items; item i; k
  li`).parseProgram());
    expect(n.index).toBeDefined();
    expect(n.key).toBeDefined();
  });
});

// ============================================================
describe('Compiler — 组件', () => {
  it('静态组件 ${MyComp}', () => {
    expect(first(comp('${MyComp}').parseProgram()).type).toBe('Component');
  });

  it('组件带属性', () => {
    const c = first(comp('${MyComp} title="hello"').parseProgram());
    expect(c.props[0].key.key).toBe('title');
  });

  it('组件带显式泛型', () => {
    const c = first(comp('${MyComp}<User> title="hello"').parseProgram());
    expect(c.typeArguments[0].raw).toBe('User');
    expect(c.props[0].key.key).toBe('title');
  });

  it('组件带嵌套泛型和多个参数', () => {
    const c = first(comp('${MyComp}<Map<string, User>, keyof User> value={x}').parseProgram());
    expect(c.typeArguments.map((arg: any) => arg.raw)).toEqual(['Map<string, User>', 'keyof User']);
    expect(c.props[0].key.key).toBe('value');
  });

  it('组件泛型后可以直接换行并解析子节点', () => {
    const c = first(comp(`
\${MyComp}<User>
  span "slot"`).parseProgram());
    expect(c.typeArguments[0].raw).toBe('User');
    expect(c.children[0].tagName).toBe('span');
  });

  it('组件泛型后可以接 pipe 扩展属性行', () => {
    const c = first(comp(`
\${MyComp}<User> title="a"
| value={x}`).parseProgram());
    expect(c.typeArguments[0].raw).toBe('User');
    expect(c.props.map((p: any) => p.key.key)).toEqual(['title', 'value']);
  });

  it('未闭合组件泛型会记录解析错误', () => {
    const c = comp('${MyComp}<User title="hello"');
    c.parseProgram();
    expect(c.errors.some((e: any) => e.code === ParseErrorCode.UNCLOSED_TYPE_ARGUMENTS)).toBe(true);
  });
});

// ============================================================
describe('Compiler — hooks', () => {
  it('parseElementNode enter/leave', () => {
    const left: string[] = [];
    const c = comp('div');
    c.hooks = {
      parseElementNode: {
        enter() {},
        leave(n: any) { left.push(n.tagName); }
      }
    };
    c.parseProgram();
    expect(left).toEqual(['div']);
  });

  it('propsAdded', () => {
    let called = false;
    const c = comp('div class="x"');
    c.hooks = {
      parseElementNode: { propsAdded(n: any) { called = n.props.length > 0; } }
    };
    c.parseProgram();
    expect(called).toBe(true);
  });
});

// ============================================================
describe('Compiler — 错误处理', () => {
  it('无效标签名 = 报错', () => {
    const c = comp('=');
    c.parseProgram();
    expect(c.errors.length).toBeGreaterThan(0);
  });

  it('属性缺少 = 报错', () => {
    const c = comp('div class');
    c.parseProgram();
    expect(c.errors.length).toBeGreaterThan(0);
  });

  it('else 前没有 if 报错', () => {
    const c = comp(`
else
  span`);
    c.parseProgram();
    expect(c.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================
describe('Compiler — 边缘场景', () => {
  it('tagName 带连字符', () => {
    expect(first(comp('my-component').parseProgram()).tagName).toBe('my-component');
  });

  it('只有空白', () => {
    expect(comp(`
  `).parseProgram().body).toHaveLength(0);
  });

  it('for 只带 key 不带 index', () => {
    const n = first(comp(`
for items; item; k
  li`).parseProgram());
    expect(n.type).toBe('For');
    expect(n.key).toBeDefined();
    expect(n.index).toBeUndefined();
  });

  it('for 循环内嵌套 if', () => {
    const n = first(comp(`
for items; item
  if item.show
    span`).parseProgram());
    expect(n.type).toBe('For');
    expect(n.children).toHaveLength(1);
    expect(n.children[0].type).toBe('If');
  });

  it('组件带 children 糖', () => {
    const props = first(comp('${MyComp} "hello"').parseProgram()).props;
    expect(props).toHaveLength(1);
    expect(props[0].key.key).toBe('children');
  });

  it('属性值为 null / undefined', () => {
    const props = first(comp('div title=null data-x=undefined').parseProgram()).props;
    const keys = props.map((p: any) => p.key.key);
    expect(keys).toContain('title');
    expect(keys).toContain('data-x');
  });

  it('组件嵌套子元素', () => {
    const c = first(comp(`
\${Layout} title="x"
  span "slot"`).parseProgram());
    expect(c.type).toBe('Component');
    expect(c.children).toHaveLength(1);
    expect(c.children[0].tagName).toBe('span');
  });

  it('pipe 扩展行', () => {
    const div = first(comp(`
div class="a"
| id="b"
  span`).parseProgram());
    const keys = div.props.map((p: any) => p.key.key);
    expect(keys).toContain('class');
    expect(div.children).toHaveLength(1);
  });

  it('管道符在错误上下文触发 PIPE_IN_WRONG_CONTEXT', () => {
    const c = comp(`
| class="a"
div`);
    c.parseProgram();
    expect(c.errors.some((e: any) => e.message.includes('|'))).toBe(true);
  });

  it('深层嵌套 4 层', () => {
    const ast = comp(`
div
  ul
    li
      span`).parseProgram();
    const div = first(ast);
    const ul = div.children[0];
    const li = ul.children[0];
    expect(div.tagName).toBe('div');
    expect(ul.tagName).toBe('ul');
    expect(li.tagName).toBe('li');
    expect(li.children[0].tagName).toBe('span');
  });

  it('多个 children 糖', () => {
    const props = first(comp('div "first" "second"').parseProgram()).props;
    // 解析为两个独立的 children 属性，最后一个生效（覆盖语义）
    const childrenProps = props.filter((p: any) => p.key.key === 'children');
    expect(childrenProps.length).toBeGreaterThanOrEqual(1);
  });
});
