import { customRender } from 'bobe';

export const BOOLEAN_ATTRS = new Set([
  'disabled', 'readonly', 'checked', 'selected', 'hidden',
  'multiple', 'required', 'autofocus', 'autoplay', 'controls',
  'loop', 'muted', 'defer', 'async', 'reversed', 'open',
  'itemscope', 'ismap', 'nohref', 'noshade', 'nowrap', 'compact', 'default'
]);

const VALUE_PROP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

const SVG_TAGS = new Set([
  'svg', 'animate', 'animateMotion', 'animateTransform', 'circle', 'clipPath',
  'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG',
  'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line', 'linearGradient',
  'marker', 'mask', 'metadata', 'mpath', 'path', 'pattern', 'polygon', 'polyline',
  'radialGradient', 'rect', 'set', 'stop', 'switch', 'symbol', 'textPath',
  'tspan', 'use', 'view'
]);

const MATH_TAGS = new Set([
  'math', 'maction', 'maligngroup', 'malignmark', 'menclose', 'merror',
  'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mlongdiv', 'mmultiscripts',
  'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mscarries',
  'mscarry', 'msgroup', 'mstack', 'mspace', 'msqrt', 'msrow', 'mstyle', 'msub',
  'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover',
  'semantics', 'annotation', 'annotation-xml'
]);

const isNS = (el: Element) => el.namespaceURI === SVG_NS || el.namespaceURI === MATH_NS;

// ---- exported for unit testing ----

export const createNode = (name: string): Node => {
  if (name === 'text') return document.createTextNode('');
  if (MATH_TAGS.has(name)) return document.createElementNS(MATH_NS, name);
  if (SVG_TAGS.has(name)) return document.createElementNS(SVG_NS, name);
  return document.createElement(name);
};

const CONTENT_FLAG = Symbol('hasContent');

export const setProp = (node: Node, key: string, value: any): (() => void) | undefined => {
  const el = node as HTMLElement;

  // 0. text
  if (key === 'text') {
    (node as any)[CONTENT_FLAG] = value != null;
    if (value == null) return;
    node.textContent = value;
    return;
  }

  // 1. 事件
  if (key.startsWith('on')) {
    const evtName = key.slice(2);
    node.addEventListener(evtName, value);
    return () => node.removeEventListener(evtName, value);
  }

  // 2. class
  if (key === 'class') {
    if (value == null) {
      el.className = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      if (isNS(el)) {
        const names = Object.entries(value as Record<string, any>)
          .filter(([, v]) => !!v)
          .map(([k]) => k)
          .join(' ');
        el.setAttribute('class', names);
      } else {
        for (const k in value) {
          el.classList.toggle(k, !!(value as Record<string, any>)[k]);
        }
      }
    } else {
      const str = typeof value === 'boolean' ? (value ? 'true' : '') : String(value);
      if (isNS(el)) {
        el.setAttribute('class', str);
      } else {
        el.className = str;
      }
    }
    return;
  }

  // 3. style
  if (key === 'style') {
    if (value == null) {
      el.style.cssText = '';
    } else {
      el.style.cssText = String(value);
    }
    return;
  }

  // 4. html
  if (key === 'html') {
    (node as any)[CONTENT_FLAG] = value != null;
    if (value == null) return;
    (node as Element).innerHTML = String(value);
    return;
  }

  // 5. 布尔属性
  if (BOOLEAN_ATTRS.has(key)) {
    if (value === false || value === null || value === undefined) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, '');
    }
    return;
  }

  // 6. input/textarea/select value & checked
  if ((key === 'value' || key === 'checked') && VALUE_PROP_TAGS.has(el.tagName)) {
    (el as any)[key] = value;
    return;
  }

  // 7. SVG/MathML 元素
  if (isNS(el)) {
    if (value == null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
    return;
  }

  // 8. data-* / aria-*
  if (key.startsWith('data-') || key.startsWith('aria-')) {
    if (value == null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(value));
    }
    return;
  }

  // 9. 其余属性
  if (value == null) {
    el.removeAttribute(key);
  } else if (key in el) {
    (el as any)[key] = value;
  } else {
    el.setAttribute(key, String(value));
  }
};

export const insertAfter = (parent: Node, node: Node, prev: Node | null) => {
  if (!prev) parent.insertBefore(node, parent.firstChild);
  else parent.insertBefore(node, prev.nextSibling);
};

export const createAnchor = (name: string) => document.createComment(name);

export const remove = (node: Node) => { (node as Element).remove(); };

export const firstChild = (node: Node) => node.firstChild;

export const nextSib = (node: Node) => node.nextSibling;

export const beforeIndent = (node: Node): boolean | void => {
  if ((node as any)[CONTENT_FLAG]) {
    const tag = (node as Element).tagName?.toLowerCase();
    const hasText = (node as HTMLElement).textContent != null;
    console.warn(`<${tag}> has ${hasText ? 'text' : 'html'} content and child elements — children ignored`);
    return false;
  }
};

// 浏览器渲染器中 leave 不需要额外操作（DOM 插入已由 insertAfter 完成）
export const leaveNode = () => {};
export const leaveLogicNode = () => {};

export const render = customRender({
  createNode,
  setProp,
  insertAfter,
  createAnchor,
  remove,
  firstChild,
  nextSib,
  beforeIndent,
  leaveNode,
  leaveLogicNode
});
