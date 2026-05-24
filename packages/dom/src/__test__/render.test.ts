import { bobe, Store } from 'bobe';
import { render } from '#/render';

function mount<T extends typeof Store>(Ctor: T) {
  const root = document.createElement('div');
  const [, store] = render(Ctor as any, root);
  return { root, store };
}

/** 等一个微任务——渲染 effect 类型为 ScheduleType.Render，通过微任务执行 */
const tick = () => new Promise(r => queueMicrotask(() => r(1)));

describe('DOM integration — bobe template rendering', () => {
  describe('basic elements', () => {
    it('should render a simple div with text', () => {
      class App extends Store {
        ui = bobe`div text="hello world"`;
      }
      const { root } = mount(App);
      expect(root.querySelector('div')!.textContent).toBe('hello world');
    });

    it('should render nested elements', () => {
      class App extends Store {
        ui = bobe`
          div
            h1 text="Title"
            p text="Paragraph"
        `;
      }
      const { root } = mount(App);
      const h1 = root.querySelector('h1')!;
      const p = root.querySelector('p')!;
      expect(h1.textContent).toBe('Title');
      expect(p.textContent).toBe('Paragraph');
    });

    it('should render multiple siblings', () => {
      class App extends Store {
        ui = bobe`
          span text="a"
          span text="b"
          span text="c"
        `;
      }
      const { root } = mount(App);
      expect(root.querySelectorAll('span').length).toBe(3);
    });
  });

  describe('attributes', () => {
    it('should set id and class', () => {
      class App extends Store {
        ui = bobe`div id="myId" class="my-class" text="hello"`;
      }
      const { root } = mount(App);
      const div = root.querySelector('div')!;
      expect(div.id).toBe('myId');
      expect(div.className).toBe('my-class');
    });

    it('should set data-* attributes', () => {
      class App extends Store {
        ui = bobe`div data-id="123" text="hi"`;
      }
      const { root } = mount(App);
      expect(root.querySelector('div')!.getAttribute('data-id')).toBe('123');
    });
  });

  describe('events', () => {
    it('should bind click events', () => {
      let clicked = false;
      class App extends Store {
        handler = () => { clicked = true; };
        ui = bobe`button onclick={handler} text="click"`;
      }
      const { root } = mount(App);
      (root.querySelector('button')! as HTMLElement).click();
      expect(clicked).toBe(true);
    });
  });

  describe('reactive values', () => {
    it('should update text when reactive value changes', async () => {
      class App extends Store {
        name = 'Alice';
        ui = bobe`span text={name}`;
      }
      const { root, store } = mount(App);
      expect(root.querySelector('span')!.textContent).toBe('Alice');
      (store as any).name = 'Bob';
      await tick();
      expect(root.querySelector('span')!.textContent).toBe('Bob');
    });

    it('should update attribute when reactive value changes', async () => {
      class App extends Store {
        btnClass = 'btn-primary';
        ui = bobe`button class={btnClass} text="Submit"`;
      }
      const { root, store } = mount(App);
      expect(root.querySelector('button')!.className).toBe('btn-primary');
      (store as any).btnClass = 'btn-danger';
      await tick();
      expect(root.querySelector('button')!.className).toBe('btn-danger');
    });
  });

  describe('conditional rendering', () => {
    it('should show/hide content with if', async () => {
      class App extends Store {
        show = true;
        ui = bobe`
          div
            if show
              span text="visible"
        `;
      }
      const { root, store } = mount(App);
      expect(root.querySelector('span')!.textContent).toBe('visible');
      (store as any).show = false;
      await tick();
      expect(root.querySelector('span')).toBeNull();
    });

    it('should handle if/else', async () => {
      class App extends Store {
        flag = true;
        ui = bobe`
          div
            if flag
              span text="yes"
            else
              span text="no"
        `;
      }
      const { root, store } = mount(App);
      expect(root.querySelector('span')!.textContent).toBe('yes');
      (store as any).flag = false;
      await tick();
      expect(root.querySelector('span')!.textContent).toBe('no');
    });
  });

  describe('for loop', () => {
    it('should render array items', () => {
      class App extends Store {
        items = ['a', 'b', 'c'];
        ui = bobe`
          ul
            for items; item i
              li text={item}
        `;
      }
      const { root } = mount(App);
      const lis = root.querySelectorAll('li');
      expect(lis.length).toBe(3);
      expect(lis[0].textContent).toBe('a');
      expect(lis[1].textContent).toBe('b');
      expect(lis[2].textContent).toBe('c');
    });

    it('should update when item added', async () => {
      class App extends Store {
        items = ['x', 'y'];
        add = () => { this.items.push('z'); };
        ui = bobe`
          ul
            for items; item i
              li text={item}
          button onclick={add} text="add"
        `;
      }
      const { root } = mount(App);
      expect(root.querySelectorAll('li').length).toBe(2);
      (root.querySelector('button')! as HTMLElement).click();
      await tick();
      expect(root.querySelectorAll('li').length).toBe(3);
    });
  });

  describe('component rendering', () => {
    it('should render child component', () => {
      class Child extends Store {
        ui = bobe`span text="child"`;
      }
      class Parent extends Store {
        ui = bobe`
          div
            ${Child}
        `;
      }
      const { root } = mount(Parent);
      expect(root.querySelector('span')!.textContent).toBe('child');
    });
  });
});
