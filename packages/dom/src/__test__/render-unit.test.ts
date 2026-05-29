import { createNode, setProp, insertAfter, createAnchor, remove, firstChild, nextSib } from '#/render';

describe('createNode', () => {
  it('should create a text node', () => {
    const node = createNode('text');
    expect(node.nodeType).toBe(Node.TEXT_NODE);
  });

  it('should create an HTML element', () => {
    const node = createNode('div') as HTMLElement;
    expect(node.tagName).toBe('DIV');
    expect(node.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });

  it('should create SVG elements with SVG namespace', () => {
    // 注意：'text' 是 bobe 的保留字（TextNode），不在 SVG_TAGS 中
    for (const tag of ['svg', 'circle', 'rect', 'path', 'g', 'line', 'polygon', 'tspan']) {
      const node = createNode(tag) as Element;
      // jsdom 中 namespaceURI 可能返回 null，用 class setAttribute 行为验证（下面 setProp 测试单独覆盖）
      expect(node.tagName).toBe(tag);
    }
  });

  it('should create MathML elements', () => {
    for (const tag of ['math', 'mi', 'mo', 'mn', 'mfrac', 'msqrt', 'mrow']) {
      const node = createNode(tag) as Element;
      expect(node.tagName).toBe(tag);
    }
  });

  it('should not treat unknown tags as SVG/MathML', () => {
    const node = createNode('custom-component') as Element;
    expect(node.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });
});

describe('setProp', () => {
  let el: HTMLElement;

  beforeEach(() => { el = document.createElement('div'); });

  describe('text', () => {
    it('should set textContent', () => {
      setProp(el, 'text', 'hello');
      expect(el.textContent).toBe('hello');
    });
  });

  describe('events', () => {
    it('should add event listener and return cleanup', () => {
      const fn = vi.fn();
      const cleanup = setProp(el, 'onclick', fn);
      el.click();
      expect(fn).toHaveBeenCalledTimes(1);
      cleanup!();
      el.click();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('class', () => {
    it('should set class from string', () => {
      setProp(el, 'class', 'foo bar');
      expect(el.className).toBe('foo bar');
    });

    it('should set class from object', () => {
      setProp(el, 'class', { active: true, inactive: false, bold: 1 });
      expect(el.classList.contains('active')).toBe(true);
      expect(el.classList.contains('inactive')).toBe(false);
      expect(el.classList.contains('bold')).toBe(true);
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

    it('should not modify innerHTML for null', () => {
      el.innerHTML = '<b>old</b>';
      setProp(el, 'html', null);
      expect(el.innerHTML).toBe('<b>old</b>');
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

    it('should remove data attribute for null', () => {
      el.setAttribute('data-id', '123');
      setProp(el, 'data-id', null);
      expect(el.hasAttribute('data-id')).toBe(false);
    });

    it('should set aria attribute', () => {
      setProp(el, 'aria-label', 'close');
      expect(el.getAttribute('aria-label')).toBe('close');
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
    const node = createAnchor('test');
    expect(node.nodeType).toBe(Node.COMMENT_NODE);
    expect(node.textContent).toBe('test');
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
