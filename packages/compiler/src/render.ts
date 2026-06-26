import { flushMicroEffectManual, Keys, Store } from 'aoye';
import { Interpreter } from './terp';
import { Tokenizer } from './tokenizer';
import { UI, ComponentNode, CustomRenderConf, FakeType, TerpConf, RenderWithMw, MwHook, RenderOptions } from './type';

export function bobe<T extends Record<any, any> = any>(fragments: TemplateStringsArray, ...values: any[]) {
  const ui: UI<T> = function ui(isSub: boolean) {
    const tokenizer = new Tokenizer(({ i }) => {
      return values[i];
    }, isSub);
    tokenizer.init(Array.from(fragments));
    return tokenizer;
  };
  ui.boundStore = Store.Current as any;
  ui[Keys.ProxyFreeObject] = true;
  ui.__BOBE_IS_UI = true;
  return ui;
}

// render -> options
export function customRender(option: CustomRenderConf) {
  const mw = new Mw();
  // 保存 options
  function render<T extends typeof Store>(Ctor: T, root: any, options: RenderOptions<T> = {}) {
    const store = Ctor.new() as InstanceType<T>;
    if(options.props) {
      Object.assign(store, options.props);
    }
    // @ts-ignore
    const tokenizer: Tokenizer = store.ui(false);
    const terp = new Interpreter(tokenizer);
    terp.config(option);
    mw.wrapHooks(terp);
    // 给外部 hook 和 DOM renderer 获取真正的 render 根节点。
    terp.root = root;

    const componentNode: ComponentNode = {
      __logicType: FakeType.Component,
      realParent: root,
      data: store,
      tokenizer
    };

    terp.program(root, componentNode);

    const onBeforeFlush = mw.wrapHook(terp, 'onBeforeFlush', option.onBeforeFlush);
    onBeforeFlush?.();

    flushMicroEffectManual();
    // ui => bobe`` 返回的函数
    return [componentNode, store] as const;
  }

  render.use = mw.use.bind(mw);

  return render as RenderWithMw;
}

export class MwCtx<T> {
  ctx: Record<any, any> = {};
  handlers: T[];
  constructor(public terp: Interpreter, handlers: T[] = [], base: T) {
    this.handlers = [...handlers, base];
  }
  i = 0;
  get next(): T | null {
    if (this.i < this.handlers.length) {
      const handler = this.handlers[this.i];
      this.i++;
      return handler;
    }
    return null;
  }

  get hasNext() {
    return this.i < this.handlers.length && this.handlers[this.i];
  }
}

export class Mw extends Map<string, any[]> {
  use(mw: MwHook) {
    for (const key in mw) {
      const list = this.get(key);
      if (list) {
        list.push(mw[key]);
      } else {
        this.set(key, [mw[key]]);
      }
    }
  }

  wrapHooks(terp: Interpreter) {
    this.forEach((list, key) => {
      let base = terp[key];
      base = base?.bind(terp);

      function wrapped(...args) {
        const ctx = new MwCtx(terp, list, base);
        return (ctx.next as Function).apply(ctx, args);
      }

      terp[key] = wrapped;
    });
  }

  wrapHook(terp: Interpreter, key: string, base: Function) {
    const list = this.get(key);
    if (!list) return base?.bind(terp);
    function wrapped(...args) {
      const ctx = new MwCtx(terp, list, base?.bind(terp));
      return (ctx.next as Function).apply(ctx, args);
    }

    return wrapped;
  }
}
