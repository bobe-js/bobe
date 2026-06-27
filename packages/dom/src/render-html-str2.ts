import { customRender, Store } from 'bobe';
import { SSRFiber } from './type';
import { parseHtmlToFibers } from './parse-html';
import { normalizeClass } from './set-prop-csr';
import { BOOLEAN_ATTRS } from './global';

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
  return new SSRFiber(name);
};

const setProp = (node: SSRFiber, key: string, value: any) => {
  node.props[key] = value;
  if (key === 'html') {
    parseHtmlToFibers(value, node);
  }
};

const beforeIndent = (node: SSRFiber) => {
  // 仅 html 需要跳过缩进子节点（子内容来自 parseHtmlToFibers）
  if (node.props.html != null) {
    return false;
  }
};

const insertAfter = (parent: SSRFiber, node: SSRFiber, prev: SSRFiber | null) => {
  let next: SSRFiber;
  if (prev) {
    next = prev.next;
    prev.next = node;
  } else {
    next = parent.child;
    parent.child = node;
  }
  node.next = next;
  node.parent = parent;
};

const createAnchor = (name: string, isBefore?: boolean) => {
  return new SSRFiber('anchor', {
    name,
    isBefore
  });
};

const remove = (node: SSRFiber, prev?: SSRFiber) => {
  const { parent, next } = node;
  node.next = null;
  if (prev) {
    prev.next = next;
  } else {
    parent.child = next;
  }
  node.parent = null;
};

const firstChild = (node: SSRFiber) => node.child;

const nextSib = (node: SSRFiber) => node.next;

export function walkFiber(root: SSRFiber) {
  let point = root;
  let shouldSink = true;
  // 下沉
  sink: do {
    // begin 组装 HTML 起始部位
    if (point.type === 'root') {
      point.html = '';
    } else if (point.type === 'anchor') {
      point.html = `<!--${point.props.name}-->`;
    } else if (point.type === 'text') {
      const text = point.props.children;
      if (text != null) {
        point.html = escapeText(point.props.children);
      }
    }
    // dom 节点
    else {
      point.html = `<${point.type}`;
      const props = point.props;
      let text;
      let idValue: string | null = null;

      for (const key in props) {
        const value = props[key];
        if (key.startsWith('on') || key === 'ref') continue;
        // html 被解析成了子节点，则不处理
        if (key === 'html') {
          continue;
        }
        if (key === 'children') {
          text = value;
          continue;
        }
        // #xxx — id toggle
        if (key.startsWith('#')) {
          if (value) idValue = key.slice(1);
          continue;
        }
        if (key === 'class') {
          continue;
        }
        if (key === 'style') {
          if (value == null) continue;
          point.html += ` style="${escapeAttr(String(value))}"`;
          continue;
        }
        // 4. 布尔属性
        if (BOOLEAN_ATTRS.has(key)) {
          if (value !== false && value !== null && value !== undefined) {
            point.html += ` ${key}`;
          }
          continue;
        }
        // 5. data-* / aria-* — 对齐 Browser：null 时不输出
        if (key.startsWith('data-') || key.startsWith('aria-')) {
          if (value == null) continue;
          point.html += ` ${key}="${escapeAttr(value)}"`;
          continue;
        }
        // 6. 其余属性 — 对齐 Browser：null 时不输出
        if (value == null) continue;
        point.html += ` ${key}="${escapeAttr(value)}"`;
      }
      const classStr = normalizeClass(point.props.class);
      if (classStr) {
        point.html += ` class="${escapeAttr(classStr)}"`;
      }
      // 输出 #xxx 设置的 id
      if (idValue) {
        point.html += ` id="${escapeAttr(idValue)}"`;
      }
      // 纯 text（无 html children）→ 内联文本，闭合标签，不下沉
      if (text != null && props.html == null) {
        const content = escapeText(text);
        point.html += `>${content}</${point.type}>`;
        if (point.child) console.warn(`<${point.type}> has text content and child elements — children ignored`);
        shouldSink = false;
      } else {
        if (VOID_TAGS.has(point.type)) {
          point.html += `/>`;
          if (point.child) console.warn(`<${point.type}> can't have children`);
          shouldSink = false;
        } else {
          point.html += `>`;
        }
      }
    }

    if (point.child && shouldSink) {
      point = point.child;
      continue;
    }
    // 上浮
    do {
      const notRoot = point !== root;
      const notAnchor = point.type !== 'anchor';
      const notText = point.type !== 'text';
      /**
       * shouldSink == false 时会直接进入节点的 complete 且不会遍历子节点
       * 此时标签已闭合，complete 不需要重复处理
       */
      if (shouldSink && notRoot && notAnchor && notText) {
        point.html += `</${point.type}>`;
      }
      // 把子节点的字符串加入父节点
      if (notRoot) {
        point.parent.html += point.html;
      }
      // complete
      // 上浮到根，end
      shouldSink = true;
      if (!notRoot) break sink;
      // 有兄弟节点，停止上浮
      if (point.next) {
        point = point.next;
        break;
      }
      // 无兄弟节点，继续上浮
      point = point.parent;
    } while (true);
  } while (true);
}

export const renderHtmlStr = (ComponentClass: typeof Store) => {
  const root = new SSRFiber('root');
  const render = customRender({
    createNode,
    setProp,
    insertAfter,
    createAnchor,
    remove,
    firstChild,
    nextSib,
    beforeIndent,
    noopEffect: true
  });
  render(ComponentClass, root);
  walkFiber(root);
  return root.html;
};
