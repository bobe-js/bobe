import type { Interpreter } from 'bobe';
import { delegateEventOnRoot } from './delegate';
import {
  BOBE_EVENT,
  BOOLEAN_ATTRS,
  CONTENT_FLAG,
  MATH_NS,
  NON_DELEGATED_EVENTS,
  SVG_NS,
  VALUE_PROP_TAGS
} from './global';

const isNS = (el: Element) => el.namespaceURI === SVG_NS || el.namespaceURI === MATH_NS;

const normalizeClassObject = (value: Record<string, any>) =>
  Object.entries(value)
    .filter(([, v]) => !!v)
    .map(([k]) => k)
    .join(' ');

export const normalizeClass = (value: any): string => {
  if (value == null) return '';

  if (Array.isArray(value)) {
    const list: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'string') {
        if (item) list.push(item);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        const names = normalizeClassObject(item);
        if (names) list.push(names);
      }
    }
    return list.join(' ');
  }

  if (typeof value === 'object') return normalizeClassObject(value as Record<string, any>);

  return String(value);
};

const setClassName = (el: Element, className: string) => {
  if (isNS(el)) {
    if ((el.getAttribute('class') || '') === className) return;
    el.setAttribute('class', className);
  } else {
    if ((el as HTMLElement).className === className) return;
    el.className = className;
  }
};

const shouldSetAsProp = (el: Element, key: string) =>
  !isNS(el) && !key.startsWith('data-') && !key.startsWith('aria-') && key in el;

const setAttr = (el: Element, key: string, value: any) => {
  try {
    if (value == null) {
      if (el.hasAttribute(key)) {
        el.removeAttribute(key);
      }
      return;
    }

    const str = String(value);
    if (el.getAttribute(key) === str) return;
    el.setAttribute(key, str);
  } catch (error) {
    console.warn('setAttr 属性设置失败', error, el, key, value);
  }
};

const setDOMProp = (el: Element, key: string, value: any) => {
  try {
    const target = el as any;
    const prev = target[key];

    if (value == null) {
      const type = typeof prev;
      const next = type === 'string' ? '' : type === 'number' ? 0 : type === 'boolean' ? false : value;

      if (!Object.is(prev, next)) {
        target[key] = next;
      }
      if (el.hasAttribute(key)) {
        el.removeAttribute(key);
      }
      return;
    }

    if (Object.is(prev, value)) return;

    target[key] = value;
  } catch (error) {
    console.warn('setDOMProp 属性设置失败', error, el, key, value);
  }
};

export function setProp(
  this: Interpreter,
  node: Node,
  key: string,
  value: any
): ((isDestroy: boolean) => void) | undefined {
  const el = node as HTMLElement;

  // 0. children
  if (key === 'children') {
    (node as any)[CONTENT_FLAG] = value != null;
    if (value == null) {
      if (node.textContent !== '') {
        node.textContent = '';
      }
      return;
    }
    const str = String(value);
    if (node.textContent === str) return;
    node.textContent = str;
    return;
  }

  // 1. 事件
  if (key.startsWith('on')) {
    const evtName = key.slice(2);
    if (NON_DELEGATED_EVENTS.has(evtName)) {
      node.addEventListener(evtName, value);
      return () => node.removeEventListener(evtName, value);
    }
    delegateEventOnRoot(this.root, evtName);
    node[`${BOBE_EVENT}${evtName}`] = value;
    return (isDestroy: boolean) => isDestroy && (node[`${BOBE_EVENT}${evtName}`] = undefined);
  }

  // 2. class
  if (key === 'class') {
    setClassName(el, normalizeClass(value));
    return;
  }

  // 3. style —— 直接与 cssText 比对，不进 BOBE_MEMO
  if (key === 'style') {
    if (value == null) {
      if (el.style.cssText !== '') el.style.cssText = '';
      return;
    }
    const str = String(value);
    if (el.style.cssText !== str) el.style.cssText = str;
    return;
  }

  // 4. html
  if (key === 'html') {
    (node as any)[CONTENT_FLAG] = value != null;
    if (value == null) {
      if ((node as Element).innerHTML === '') return;
      (node as Element).innerHTML = '';
      return;
    }
    const str = String(value);
    if ((node as Element).innerHTML === str) return;
    (node as Element).innerHTML = str;
    return;
  }

  // 5. input/textarea/select value & input checked
  if (key === 'value' && VALUE_PROP_TAGS.has(el.tagName)) {
    const str = String(value);
    if (Object.is((el as any)[key], str)) return;
    (el as any)[key] = str;
    return;
  }

  if (key === 'checked' && el.tagName === 'INPUT') {
    const checked = !!value;
    if (Object.is((el as any)[key], checked)) return;
    (el as any)[key] = checked;
    return;
  }

  // 6. 布尔属性
  if (BOOLEAN_ATTRS.has(key)) {
    const shouldHaveAttr = value !== false && value !== null && value !== undefined;
    if (el.hasAttribute(key) === shouldHaveAttr) return;
    if (shouldHaveAttr) {
      el.setAttribute(key, '');
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  if (key.startsWith('#')) {
    const id = key.slice(1);
    if (value) {
      if (el.id === id) return;
      el.id = id;
    } else {
      if (!el.hasAttribute('id')) return;
      el.removeAttribute('id');
    }
    return;
  }

  // 9. 其余属性
  if (shouldSetAsProp(el, key)) {
    setDOMProp(el, key, value);
  } else {
    setAttr(el, key, value);
  }
}
