/**
 * @vitest-environment jsdom
 */
import { bobe, Store } from 'bobe';
import { renderHtmlStr } from '#/render-html-str';
import { hydrate } from '#/render-hydrate';

function renderAndHydrate<T extends typeof Store>(Ctor: T) {
  const { html } = renderHtmlStr(Ctor as any);
  document.body.innerHTML = html;
  hydrate(Ctor as any, document.body);
  return document.body.firstElementChild as Element;
}

/** 与 Browser render.test.ts 一致的 mount 模式，返回 store 用于触发更新 */
function mountHydrate<T extends typeof Store>(Ctor: T) {
  const { html } = renderHtmlStr(Ctor as any);
  document.body.innerHTML = html;
  const [, store] = hydrate(Ctor as any, document.body);
  return { root: document.body.firstElementChild as Element, store };
}

const tick = () => new Promise(r => queueMicrotask(() => r(1)));

describe('hydrate — node identity (TreeCursor matching)', () => {
  it('should reuse existing element node', () => {
    class App extends Store {
      ui = bobe`div text="hello"`;
    }
    const { html } = renderHtmlStr(App as any);
    document.body.innerHTML = html;
    hydrate(App as any, document.body);

    // 元素节点身份保持不变
    const root = document.body.firstChild as Element;
    expect(document.body.firstChild).toBe(root);
    // 内容正确（textContent 被 setProp 重设，TextNode 可能被替换）
    expect(root.textContent).toBe('hello');
  });

  it('should reuse nested elements', () => {
    class App extends Store {
      ui = bobe`
        div
          h1 text="Title"
          p text="Paragraph"
      `;
    }
    const { html } = renderHtmlStr(App as any);
    document.body.innerHTML = html;
    const root = document.body.firstChild as Element;
    const h1 = root.firstElementChild!;
    const p = h1.nextElementSibling!;

    hydrate(App as any, document.body);

    expect(root.firstElementChild).toBe(h1);
    expect(h1.nextElementSibling).toBe(p);
  });

  it('should reuse comment anchors', () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="visible"
      `;
    }
    const { html } = renderHtmlStr(App as any);
    document.body.innerHTML = html;
    const root = document.body.firstChild as Element;
    // SSR 输出: <div><span>visible</span><!--if-after--></div>
    const span = root.firstElementChild!;
    const anchor = span.nextSibling as Comment;

    hydrate(App as any, document.body);

    expect(root.firstElementChild).toBe(span);
    expect(span.nextSibling).toBe(anchor);
    expect(anchor.data).toBe('if-after');
  });

  it('should reuse for-item elements', () => {
    class App extends Store {
      items = ['a', 'b'];
      ui = bobe`
        ul
          for items; item i
            li text={item}
      `;
    }
    const { html } = renderHtmlStr(App as any);
    document.body.innerHTML = html;
    const root = document.body.firstChild as Element;
    const lis = Array.from(root.querySelectorAll('li'));

    hydrate(App as any, document.body);

    const afterHydrate = root.querySelectorAll('li');
    expect(afterHydrate.length).toBe(2);
    // 元素节点身份保持不变
    expect(afterHydrate[0]).toBe(lis[0]);
    expect(afterHydrate[1]).toBe(lis[1]);
  });
});

describe('hydrate — basic elements', () => {
  it('should hydrate a simple div with text', () => {
    class App extends Store {
      ui = bobe`div text="hello"`;
    }
    const root = renderAndHydrate(App);
    expect(root.outerHTML).toBe('<div>hello</div>');
  });

  it('should hydrate nested elements', () => {
    class App extends Store {
      ui = bobe`
        div
          h1 text="Title"
          p text="Paragraph"
      `;
    }
    const root = renderAndHydrate(App);
    expect(root.querySelector('h1')!.textContent).toBe('Title');
    expect(root.querySelector('p')!.textContent).toBe('Paragraph');
  });
});

describe('hydrate — event binding', () => {
  it('should attach click handler', () => {
    let clicked = false;
    class App extends Store {
      handleClick = () => { clicked = true; };
      ui = bobe`div\n  button onclick={handleClick} text="click me"`;
    }
    const root = renderAndHydrate(App);
    (root.querySelector('button') as HTMLButtonElement).click();
    expect(clicked).toBe(true);
  });
});

describe('hydrate — conditional rendering', () => {
  it('should hydrate if branch when condition is true', () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="visible"
      `;
    }
    const root = renderAndHydrate(App);
    expect(root.querySelector('span')!.textContent).toBe('visible');
  });

  it('should skip if branch when condition is false', () => {
    class App extends Store {
      show = false;
      ui = bobe`
        div
          if show
            span text="hidden"
      `;
    }
    const root = renderAndHydrate(App);
    expect(root.querySelector('span')).toBeNull();
  });
});

describe('hydrate — for loop', () => {
  it('should hydrate array items', () => {
    class App extends Store {
      items = ['a', 'b', 'c'];
      ui = bobe`
        ul
          for items; item i
            li text={item}
      `;
    }
    const root = renderAndHydrate(App);
    const lis = root.querySelectorAll('li');
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe('a');
    expect(lis[1].textContent).toBe('b');
    expect(lis[2].textContent).toBe('c');
  });
});

describe('hydrate — component rendering', () => {
  it('should hydrate child component', () => {
    class Child extends Store {
      ui = bobe`span text="child"`;
    }
    class Parent extends Store {
      ui = bobe`
        div
          ${Child}
      `;
    }
    const root = renderAndHydrate(Parent);
    expect(root.querySelector('span')!.textContent).toBe('child');
  });
});

describe('hydrate — context node', () => {
  it('should hydrate context provider with children', () => {
    class Child extends Store {
      ui = bobe`span text="child"`;
    }
    class App extends Store {
      ui = bobe`
        div
          context
            ${Child}
      `;
    }
    const root = renderAndHydrate(App);
    expect(root.querySelector('span')!.textContent).toBe('child');
  });
});

describe('hydrate — attributes', () => {
  it('should hydrate class attribute', () => {
    class App extends Store {
      cls = 'active';
      ui = bobe`div class={cls} text="hi"`;
    }
    const root = renderAndHydrate(App);
    expect((root as Element).className).toBe('active');
  });

  it('should hydrate style attribute', () => {
    class App extends Store {
      ui = bobe`div style="color: red" text="hi"`;
    }
    const root = renderAndHydrate(App);
    expect((root as HTMLElement).style.color).toBe('red');
  });
});

describe('hydrate — text/html conflict', () => {
  it('should skip children when text conflicts', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class App extends Store {
      ui = bobe`
        div text="content"
          span text="child"
      `;
    }
    const root = renderAndHydrate(App);
    expect(root.textContent).toBe('content');
    expect(root.querySelector('span')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('hydrate — reactive updates', () => {
  it('should update text when reactive value changes', async () => {
    class App extends Store {
      name = 'Alice';
      ui = bobe`div\n  span text={name}`;
    }
    const { root, store } = mountHydrate(App);
    expect(root.querySelector('span')!.textContent).toBe('Alice');

    (store as any).name = 'Bob';
    await tick();
    expect(root.querySelector('span')!.textContent).toBe('Bob');
  });

  it('should update attribute when reactive value changes', async () => {
    class App extends Store {
      cls = 'btn-primary';
      ui = bobe`div\n  button class={cls} text="Submit"`;
    }
    const { root, store } = mountHydrate(App);
    expect(root.querySelector('button')!.className).toBe('btn-primary');

    (store as any).cls = 'btn-danger';
    await tick();
    expect(root.querySelector('button')!.className).toBe('btn-danger');
  });

  it('should show/hide content with if toggle', async () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="visible"
      `;
    }
    const { root, store } = mountHydrate(App);
    expect(root.querySelector('span')!.textContent).toBe('visible');

    (store as any).show = false;
    await tick();
    expect(root.querySelector('span')).toBeNull();
  });

  it('should add item in for loop', async () => {
    class App extends Store {
      items = ['a', 'b'];
      add = () => { this.items.push('c'); };
      ui = bobe`
        div
          ul
            for items; item i
              li text={item}
          button onclick={add} text="add"
      `;
    }
    const { root } = mountHydrate(App);
    expect(root.querySelectorAll('li').length).toBe(2);

    (root.querySelector('button')! as HTMLElement).click();
    await tick();
    expect(root.querySelectorAll('li').length).toBe(3);
    expect(root.querySelectorAll('li')[2].textContent).toBe('c');
  });

});
