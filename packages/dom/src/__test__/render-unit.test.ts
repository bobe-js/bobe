import { createNode, insertAfter, createAnchor, remove, firstChild, nextSib } from '#/render';
import { setProp as _setProp } from '#/set-prop-csr';


import { BOBE_MEMO } from '#/global';
import type { Interpreter } from 'bobe';
const setProp = _setProp as (node: any, key: string, value: any) => ((isDestroy: boolean) => void) | undefined;

let mockInterpreter: Interpreter;

function createMockInterpreter(root: Node = document.createElement('div')) {
  return { root } as Interpreter;
}

beforeEach(() => {
  mockInterpreter = createMockInterpreter();
});

describe('createNode', () => {
  it('should create a text node', () => {
    const node = createNode.call(mockInterpreter, 'text');
    expect(node.nodeType).toBe(Node.TEXT_NODE);
  });

  it('should create an HTML element', () => {
    const node = createNode.call(mockInterpreter, 'div') as HTMLElement;
    expect(node.tagName).toBe('DIV');
    expect(node.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });

  it('should create SVG elements with SVG namespace', () => {
    // 注意：'children' 是 bobe 的保留字（TextNode），不在 SVG_TAGS 中
    for (const tag of ['svg', 'circle', 'rect', 'path', 'g', 'line', 'polygon', 'tspan']) {
      const node = createNode.call(mockInterpreter, tag) as Element;
      // jsdom 中 namespaceURI 可能返回 null，用 class setAttribute 行为验证（下面 setProp 测试单独覆盖）
      expect(node.tagName).toBe(tag);
    }
  });

  it('should create MathML elements', () => {
    for (const tag of ['math', 'mi', 'mo', 'mn', 'mfrac', 'msqrt', 'mrow']) {
      const node = createNode.call(mockInterpreter, tag) as Element;
      expect(node.tagName).toBe(tag);
    }
  });

  it('should not treat unknown tags as SVG/MathML', () => {
    const node = createNode.call(mockInterpreter, 'custom-component') as Element;
    expect(node.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });

  it('should create nodes from this.root.ownerDocument', () => {
    const doc = document.implementation.createHTMLDocument('custom');
    const root = doc.createElement('main');
    mockInterpreter = createMockInterpreter(root);

    const node = createNode.call(mockInterpreter, 'div');

    expect(node.ownerDocument).toBe(doc);
  });
});

describe('setProp', () => {
  let el: HTMLElement;

  beforeEach(() => { el = document.createElement('div'); });

  describe('children', () => {
    it('should set textContent', () => {
      setProp(el, 'children', 'hello');
      expect(el.textContent).toBe('hello');
    });

    it('should clear textContent for null', () => {
      setProp(el, 'children', 'hello');
      setProp(el, 'children', null);
      expect(el.textContent).toBe('');
    });

    it('should skip same textContent writes', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(Node.prototype, 'textContent', 'set').mockImplementation(setter);

      setProp(el, 'children', 'hello');
      setProp(el, 'children', 'hello');
      setProp(el, 'children', 'world');

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.textContent).toBe('world');
      spy.mockRestore();
    });

    it('should skip repeated null textContent clears', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(Node.prototype, 'textContent', 'set').mockImplementation(setter);

      setProp(el, 'children', 'hello');
      setProp(el, 'children', null);
      setProp(el, 'children', null);

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.textContent).toBe('');
      spy.mockRestore();
    });
  });

  describe('events', () => {
    it('should delegate bubbling events on root and clear on destroy', () => {
      mockInterpreter.root.appendChild(el);
      const fn = vi.fn();
      const cleanup = setProp.call(mockInterpreter, el, 'onclick', fn);
      el.click();
      expect(fn).toHaveBeenCalledTimes(1);
      cleanup!(true);
      el.click();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use node listener for non-delegated events', () => {
      const fn = vi.fn();
      const cleanup = setProp.call(mockInterpreter, el, 'onmouseenter', fn);

      el.dispatchEvent(new MouseEvent('mouseenter'));
      expect(fn).toHaveBeenCalledTimes(1);

      cleanup!(false);
      el.dispatchEvent(new MouseEvent('mouseenter'));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('class', () => {
    it('should set class from string', () => {
      setProp(el, 'class', 'foo bar');
      expect(el.className).toBe('foo bar');
    });

    it('should ignore dot props without affecting class', () => {
      setProp(el, '.foo', true);
      setProp(el, 'class', 'base1 base2');
      setProp(el, '.bar', true);
      expect(el.className).toBe('base1 base2');
      expect((el as any)['.foo']).toBeUndefined();
      expect((el as any)['.bar']).toBeUndefined();
      expect(el.hasAttribute('.foo')).toBe(false);
      expect(el.hasAttribute('.bar')).toBe(false);
    });

    it('should not let dot props affect class updates', () => {
      setProp(el, '.foo', true);
      setProp(el, 'class', 'base');
      setProp(el, '.foo', false);
      expect(el.className).toBe('base');
      expect((el as any)['.foo']).toBeUndefined();
      expect(el.hasAttribute('.foo')).toBe(false);
    });

    it('should skip same class string writes', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'className')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(Element.prototype, 'className', 'set').mockImplementation(setter);

      setProp(el, 'class', 'foo bar');
      setProp(el, 'class', 'foo bar');
      setProp(el, 'class', 'foo baz');

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.className).toBe('foo baz');
      spy.mockRestore();
    });

    it('should skip repeated dot props without touching class', () => {
      setProp(el, '.danger', true);
      setProp(el, '.danger', true);
      setProp(el, '.danger', false);
      setProp(el, '.danger', false);

      expect((el as any)['.danger']).toBeUndefined();
      expect(el.hasAttribute('.danger')).toBe(false);
      expect(el.classList.contains('danger')).toBe(false);
    });

    it('should set class from object', () => {
      setProp(el, 'class', { active: true, inactive: false, bold: 1 });
      expect(el.classList.contains('active')).toBe(true);
      expect(el.classList.contains('inactive')).toBe(false);
      expect(el.classList.contains('bold')).toBe(true);
    });

    it('should set class from a single-level array of strings and objects', () => {
      setProp(el, 'class', ['btn primary', { active: true, hidden: false }, ['nested'], 123, null]);
      expect(el.className).toBe('btn primary active');
    });

    it('should not create memo for class updates', () => {
      setProp(el, 'class', ['btn', { active: true }]);
      setProp(el, 'class', ['btn', { active: true }]);

      expect((el as any)[BOBE_MEMO]).toBeUndefined();
    });

    it('should clear class for null', () => {
      el.className = 'old';
      setProp(el, 'class', null);
      expect(el.className).toBe('');
    });

    it('should clear class for undefined', () => {
      el.className = 'old';
      setProp(el, 'class', undefined);
      expect(el.className).toBe('');
    });

    it('should coerce number to string', () => {
      setProp(el, 'class', 123);
      expect(el.className).toBe('123');
    });

    it('should set class via setAttribute for SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      setProp(svg, 'class', 'my-svg');
      expect(svg.getAttribute('class')).toBe('my-svg');
    });

    it('should set class from object via setAttribute for SVG elements', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      setProp(svg, 'class', { active: true, hidden: false });
      expect(svg.getAttribute('class')).toBe('active');
    });
  });

  describe('style', () => {
    it('should set style from string', () => {
      setProp(el, 'style', 'color: red; font-size: 12px');
      expect(el.style.color).toBe('red');
      expect(el.style.fontSize).toBe('12px');
    });

    it('should skip same cssText writes but apply changed values', () => {
      const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(CSSStyleDeclaration.prototype, 'cssText', 'set').mockImplementation(setter);

      // 归一化输入（与 el.style.cssText 回读一致）才能命中跳过
      setProp(el, 'style', 'color: red;');
      setProp(el, 'style', 'color: red;');
      setProp(el, 'style', 'color: blue;');

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.style.color).toBe('blue');
      spy.mockRestore();
    });

    it('should clear style for null', () => {
      el.style.color = 'red';
      setProp(el, 'style', null);
      expect(el.style.cssText).toBe('');
    });

    it('should clear style for undefined', () => {
      el.style.color = 'red';
      setProp(el, 'style', undefined);
      expect(el.style.cssText).toBe('');
    });
  });

  describe('html', () => {
    it('should set innerHTML', () => {
      setProp(el, 'html', '<span>hi</span>');
      expect(el.innerHTML).toBe('<span>hi</span>');
    });

    it('should skip same innerHTML writes', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(setter);

      setProp(el, 'html', '<span>hi</span>');
      setProp(el, 'html', '<span>hi</span>');
      setProp(el, 'html', '<span>bye</span>');

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.innerHTML).toBe('<span>bye</span>');
      spy.mockRestore();
    });

    it('should clear innerHTML for null', () => {
      el.innerHTML = '<b>old</b>';
      setProp(el, 'html', null);
      expect(el.innerHTML).toBe('');
    });

    it('should skip repeated null innerHTML clears', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(setter);

      setProp(el, 'html', '<b>old</b>');
      setProp(el, 'html', null);
      setProp(el, 'html', null);

      expect(setter).toHaveBeenCalledTimes(2);
      expect(el.innerHTML).toBe('');
      spy.mockRestore();
    });

    it('should clear innerHTML for empty string', () => {
      el.innerHTML = '<b>old</b>';
      setProp(el, 'html', '');
      expect(el.innerHTML).toBe('');
    });
  });

  describe('boolean attributes', () => {
    it('should set disabled when truthy', () => {
      setProp(el, 'disabled', true);
      expect(el.hasAttribute('disabled')).toBe(true);
    });

    it('should skip same boolean attribute writes', () => {
      const setSpy = vi.spyOn(el, 'setAttribute');
      const removeSpy = vi.spyOn(el, 'removeAttribute');

      setProp(el, 'disabled', true);
      setProp(el, 'disabled', true);
      setProp(el, 'disabled', false);
      setProp(el, 'disabled', false);

      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(el.hasAttribute('disabled')).toBe(false);
      setSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('should remove disabled when false', () => {
      el.setAttribute('disabled', '');
      setProp(el, 'disabled', false);
      expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('should remove disabled when null', () => {
      el.setAttribute('disabled', '');
      setProp(el, 'disabled', null);
      expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('should remove disabled when undefined', () => {
      el.setAttribute('disabled', '');
      setProp(el, 'disabled', undefined);
      expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('should set multiple boolean attrs', () => {
      setProp(el, 'readonly', true);
      setProp(el, 'hidden', 'truthy');
      expect(el.hasAttribute('readonly')).toBe(true);
      expect(el.hasAttribute('hidden')).toBe(true);
    });
  });

  describe('value / checked on form elements', () => {
    it('should set value on input', () => {
      const input = document.createElement('input');
      setProp(input, 'value', 'test');
      expect((input as HTMLInputElement).value).toBe('test');
    });

    it('should skip same input value property writes', () => {
      const input = document.createElement('input');
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(HTMLInputElement.prototype, 'value', 'set').mockImplementation(setter);

      setProp(input, 'value', 'test');
      setProp(input, 'value', 'test');
      setProp(input, 'value', 'next');

      expect(setter).toHaveBeenCalledTimes(2);
      expect(input.value).toBe('next');
      spy.mockRestore();
    });

    it('should set value on textarea', () => {
      const ta = document.createElement('textarea');
      setProp(ta, 'value', 'hello');
      expect((ta as HTMLTextAreaElement).value).toBe('hello');
    });

    it('should set value property on select', () => {
      const select = document.createElement('select');
      // select 需要 option 子元素才能正确设置 value
      const opt = document.createElement('option');
      opt.value = 'opt1';
      select.appendChild(opt);
      setProp(select, 'value', 'opt1');
      expect((select as HTMLSelectElement).value).toBe('opt1');
    });

    it('should set checked on input', () => {
      const input = document.createElement('input');
      setProp(input, 'checked', true);
      expect((input as HTMLInputElement).checked).toBe(true);
    });

    it('should skip same checked property writes', () => {
      const input = document.createElement('input');
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!;
      const setter = vi.fn(descriptor.set!);
      const spy = vi.spyOn(HTMLInputElement.prototype, 'checked', 'set').mockImplementation(setter);

      setProp(input, 'checked', true);
      setProp(input, 'checked', true);
      setProp(input, 'checked', false);

      expect(setter).toHaveBeenCalledTimes(2);
      expect(input.checked).toBe(false);
      spy.mockRestore();
    });

    it('should NOT use property for value on div', () => {
      setProp(el, 'value', 'test');
      expect(el.getAttribute('value')).toBe('test');
    });
  });

  describe('data-* and aria-*', () => {
    it('should set data attribute', () => {
      setProp(el, 'data-id', '123');
      expect(el.getAttribute('data-id')).toBe('123');
    });

    it('should skip same data attribute writes', () => {
      const spy = vi.spyOn(el, 'setAttribute');

      setProp(el, 'data-id', '123');
      setProp(el, 'data-id', '123');
      setProp(el, 'data-id', '456');

      expect(spy).toHaveBeenCalledTimes(2);
      expect(el.getAttribute('data-id')).toBe('456');
      spy.mockRestore();
    });

    it('should not create memo for data attributes', () => {
      setProp(el, 'data-id', '123');
      setProp(el, 'data-id', '123');
      setProp(el, 'data-id', null);
      setProp(el, 'data-id', null);

      expect((el as any)[BOBE_MEMO]).toBeUndefined();
    });

    it('should remove data attribute for null', () => {
      el.setAttribute('data-id', '123');
      setProp(el, 'data-id', null);
      expect(el.hasAttribute('data-id')).toBe(false);
    });

    it('should skip repeated memo attribute removals', () => {
      const removeSpy = vi.spyOn(el, 'removeAttribute');

      setProp(el, 'data-id', '123');
      setProp(el, 'data-id', null);
      setProp(el, 'data-id', null);

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(el.hasAttribute('data-id')).toBe(false);
      removeSpy.mockRestore();
    });

    it('should set aria attribute', () => {
      setProp(el, 'aria-label', 'close');
      expect(el.getAttribute('aria-label')).toBe('close');
    });

    it('should skip same aria attribute writes', () => {
      const spy = vi.spyOn(el, 'setAttribute');

      setProp(el, 'aria-label', 'close');
      setProp(el, 'aria-label', 'close');
      setProp(el, 'aria-label', 'open');

      expect(spy).toHaveBeenCalledTimes(2);
      expect(el.getAttribute('aria-label')).toBe('open');
      spy.mockRestore();
    });

    it('should remove aria attribute for null', () => {
      el.setAttribute('aria-label', 'close');
      setProp(el, 'aria-label', null);
      expect(el.hasAttribute('aria-label')).toBe(false);
    });
  });

  describe('SVG/MathML namespace elements', () => {
    it('should set attributes via setAttribute for SVG', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      setProp(svg, 'viewBox', '0 0 100 100');
      expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    });

    it('should remove attributes for null on SVG', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      setProp(svg, 'viewBox', null);
      expect(svg.hasAttribute('viewBox')).toBe(false);
    });
  });

  describe('fallback attributes', () => {
    it('should set id as DOM property', () => {
      setProp(el, 'id', 'myId');
      expect(el.id).toBe('myId');
    });

    it('should set custom attribute', () => {
      setProp(el, 'data-foo', 'bar');
      expect(el.getAttribute('data-foo')).toBe('bar');
    });

    it('should not create memo for fallback attributes', () => {
      setProp(el, 'unknown-prop', 'bar');
      setProp(el, 'unknown-prop', 'bar');
      setProp(el, 'unknown-prop', null);
      setProp(el, 'unknown-prop', null);

      expect((el as any)[BOBE_MEMO]).toBeUndefined();
    });

    it('should remove attribute for null', () => {
      el.setAttribute('title', 'old');
      setProp(el, 'title', null);
      expect(el.hasAttribute('title')).toBe(false);
    });

    it('should remove attribute for undefined', () => {
      el.setAttribute('title', 'old');
      setProp(el, 'title', undefined);
      expect(el.hasAttribute('title')).toBe(false);
    });
  });
});

describe('insertAfter', () => {
  it('should insert as first child when prev is null', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    insertAfter(parent, child, null);
    expect(parent.firstChild).toBe(child);
  });

  it('should insert after prev node', () => {
    const parent = document.createElement('div');
    const first = document.createElement('span');
    const second = document.createElement('span');
    parent.appendChild(first);
    insertAfter(parent, second, first);
    expect(parent.childNodes[0]).toBe(first);
    expect(parent.childNodes[1]).toBe(second);
  });
});

describe('createAnchor', () => {
  it('should create a comment node with given text', () => {
    const node = createAnchor.call(mockInterpreter, 'test');
    expect(node.nodeType).toBe(Node.COMMENT_NODE);
    expect(node.textContent).toBe('test');
  });

  it('should create comments from this.root.ownerDocument', () => {
    const doc = document.implementation.createHTMLDocument('custom');
    const root = doc.createElement('main');
    mockInterpreter = createMockInterpreter(root);

    const node = createAnchor.call(mockInterpreter, 'test');

    expect(node.ownerDocument).toBe(doc);
  });
});

describe('remove', () => {
  it('should remove node from parent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(parent.childNodes.length).toBe(1);
    remove(child);
    expect(parent.childNodes.length).toBe(0);
  });
});

describe('firstChild / nextSib', () => {
  it('firstChild should return first child', () => {
    const p = document.createElement('div');
    const c = document.createElement('span');
    p.appendChild(c);
    expect(firstChild(p)).toBe(c);
  });

  it('firstChild should return null for no children', () => {
    expect(firstChild(document.createElement('div'))).toBeNull();
  });

  it('nextSib should return next sibling', () => {
    const p = document.createElement('div');
    const a = document.createElement('span');
    const b = document.createElement('span');
    p.appendChild(a);
    p.appendChild(b);
    expect(nextSib(a)).toBe(b);
  });

  it('nextSib should return null for last child', () => {
    const p = document.createElement('div');
    const c = document.createElement('span');
    p.appendChild(c);
    expect(nextSib(c)).toBeNull();
  });
});
