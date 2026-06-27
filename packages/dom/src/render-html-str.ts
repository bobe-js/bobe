import { customRender, Store, LogicNode } from 'bobe';
import { cleanCtx, ctx } from './global';
import { Root, Element, Text, Anchor, SSRNode, SSRNodeType } from './type';
import { normalizeClass } from './set-prop-csr';

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

const BOOLEAN_ATTRS = new Set([
  'disabled',
  'readonly',
  'checked',
  'selected',
  'hidden',
  'multiple',
  'required',
  'autofocus',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'defer',
  'async',
  'reversed',
  'open',
  'itemscope',
  'ismap',
  'nohref',
  'noshade',
  'nowrap',
  'compact',
  'default'
]);

const ATTR_RE = /[&"<>]/g;
const TEXT_RE = /[&<>]/g;
const ATTR_MAP: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;'
};
const TEXT_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
};

const escapeAttr = (str: string) => {
  const s = String(str);
  return ATTR_RE.test(s) ? s.replace(ATTR_RE, m => ATTR_MAP[m]) : s;
};

const escapeText = (str: string) => {
  const s = String(str);
  return TEXT_RE.test(s) ? s.replace(TEXT_RE, m => TEXT_MAP[m]) : s;
};

const createNode = (name: string) => {
  if (name === 'text') {
    return new Text('');
  }
  ctx.root.value += `<${name}`;
  return new Element(name);
};

const flushId = (node: Text | Element) => {
  const idValue = node.attrs['#id'];
  if (idValue) ctx.root.value += ` id="${escapeAttr(idValue)}"`;
};

const flushClass = (node: Text | Element) => {
  const classStr = node.attrs.class;
  if (classStr) ctx.root.value += ` class="${escapeAttr(classStr)}"`;
};

const setProp = (node: Text | Element, key: string, value: any) => {
  if (node.startClosed) return;
  if (key.startsWith('on') || key === 'ref') return;

  // 0. children
  if (key === 'children') {
    if (value == null) return;
    node.textContent = value;
    return;
  }

  // 1. html
  if (key === 'html') {
    if (value == null) return;
    node._innerHtml = String(value);
    return;
  }

  if (key.startsWith('#')) {
    if (value) {
      node.attrs['#id'] = key.slice(1);
    } else {
      node.attrs['#id'] = undefined;
    }
    return;
  }

  if (key === 'class') {
    node.attrs.class = normalizeClass(value);
    return;
  }

  // 3. style — 对齐 Browser
  if (key === 'style') {
    if (value == null) return;
    ctx.root.value += ` style="${escapeAttr(String(value))}"`;
    return;
  }

  // 4. 布尔属性
  if (BOOLEAN_ATTRS.has(key)) {
    if (value !== false && value !== null && value !== undefined) {
      ctx.root.value += ` ${key}`;
    }
    return;
  }

  // 5. data-* / aria-* — 对齐 Browser：null 时不输出
  if (key.startsWith('data-') || key.startsWith('aria-')) {
    if (value == null) return;
    ctx.root.value += ` ${key}="${escapeAttr(value)}"`;
    return;
  }

  // 6. 其余属性 — 对齐 Browser：null 时不输出
  if (value == null) return;
  ctx.root.value += ` ${key}="${escapeAttr(value)}"`;
};

const appendInnerContent = (node: Element) => {
  if (node._innerHtml != null) {
    ctx.root.value += node._innerHtml;
    return true;
  }
  if (node.textContent != null) {
    ctx.root.value += escapeText(node.textContent);
    return true;
  }
  return false;
};

const beforeIndent = (node: Text | Element): boolean => {
  if (node instanceof Text) return true;

  const hasText = node.textContent != null;
  const hasHtml = node._innerHtml != null;

  // 不能包含内容的元素
  if (VOID_TAGS.has(node.value)) {
    ctx.root.value += `/>`;
    console.warn(`<${node.value}> can't have children`);
    node.startClosed = true;
    node.closed = true;
    return false;
  }

  if (hasText || hasHtml) {
    console.warn(`<${node.value}> has ${hasHtml ? 'html' : 'text'} content and child elements — children ignored`);
    // 容器元素有 text/html 内容且检测到子节点冲突，立即闭合；与 leaveNode 叶元素路径互斥
    flushClass(node);
    flushId(node);
    ctx.root.value += `>`;
    appendInnerContent(node);
    ctx.root.value += `</${node.value}>`;
    node.startClosed = true;
    node.closed = true;
    return false;
  }

  flushClass(node);
  flushId(node);
  ctx.root.value += `>`;
  node.startClosed = true;
  return true;
};

const leaveLogicNode = (node: LogicNode) => {
  const realAfter = node.realAfter as Anchor;
  ctx.root.value += `<!--${realAfter.value}-->`;
};
const leaveNode = (node: Text | Element, isDedent: boolean) => {
  /**
   * indent 提前 closed 就退出，这两种都是有缩进的
   * 1. 元素属于 VOID_TAGS
   * 2. 元素 text/html 属性与 children 冲突，采用 text/html
   */
  if (node.closed) return;
  if (node instanceof Text) {
    ctx.root.value += escapeText(node.textContent);
  } else {
    // 如果现在是 "<div>" 状态，添加 />
    if (node.startClosed) {
      // 什么都不做,正常永远都不会进入，因为 beforeIndent 会直接加 /> 设置 closed = true
      if (VOID_TAGS.has(node.value)) {
      } else {
        ctx.root.value += `</${node.value}>`;
      }
    }
    // 无 startClosed, 叶子节点
    else {
      // 直接自闭合
      if (VOID_TAGS.has(node.value)) {
        ctx.root.value += ` />`;
      }
      // 先加入 '>' 再看有内容加内容，最后反 Tag 闭合
      else {
        flushClass(node);
        flushId(node);
        ctx.root.value += `>`;
        // 叶元素，无子节点；与 beforeIndent 中的 appendInnerContent 互斥
        appendInnerContent(node);
        ctx.root.value += `</${node.value}>`;
      }
    }
  }
};

const insertAfter = (parent: SSRNode, node: SSRNode, prev: SSRNode | null) => {
  const next = prev ? prev.nextSibling : parent.firstChild;
  node.nextSibling = next;
  node.prevSibling = prev;

  if (prev) {
    prev.nextSibling = node;
  } else {
    parent.firstChild = node;
  }
  if (next) {
    next.prevSibling = node;
  } else {
    parent.lastChild = node;
  }
  node.parent = parent;
};

const createAnchor = (name: string, isBefore?: boolean) => {
  if (isBefore) {
    ctx.root.value += `<!--${name}-->`;
  }
  return new Anchor(name);
};

const remove = (node: SSRNode) => {
  const { parent, prevSibling, nextSibling } = node;
  if (prevSibling) {
    prevSibling.nextSibling = nextSibling;
  }
  if (nextSibling) {
    nextSibling.prevSibling = prevSibling;
  }
  if (parent) {
    if (parent.firstChild === node) {
      parent.firstChild = nextSibling;
    }
    if (parent.lastChild === node) {
      parent.lastChild = prevSibling;
    }
  }
};

const firstChild = (node: SSRNode) => node.firstChild;

const nextSib = (node: SSRNode) => node.nextSibling;

export const renderHtmlStr = (ComponentClass: typeof Store) => {
  cleanCtx();
  const root = new Root('');
  ctx.root = ctx.current = root;
  const render = customRender({
    createNode,
    setProp,
    insertAfter,
    createAnchor,
    remove,
    firstChild,
    nextSib,
    beforeIndent,
    leaveNode,
    leaveLogicNode,
    noopEffect: true
  });
  render(ComponentClass, root);
  return {
    html: ctx.root.value
  };
};
