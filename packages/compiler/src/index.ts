import { Interpreter } from './terp';
import { Store } from 'aoye';
import { Tokenizer } from './tokenizer';
import { BobeUI, CustomRenderConf } from './type';
export * from 'aoye';
export function bobe(fragments: TemplateStringsArray, ...values: any[]) {
  const ui: BobeUI = function ui(options, valueOpt, root, before) {
    const tokenizer = new Tokenizer();
    const cmp = new Interpreter(tokenizer);
    Object.assign(cmp, valueOpt);
    // 初始化
    cmp.config({
      // 由 tokenizer 接管
      hook({ i }) {
        return values[i];
      },
      setProp(node: any, key: string, value: any, hookI?: number) {
        node.props[key] = value;
      },
      ...options
    });
    cmp.init(Array.from(fragments));
    return cmp.program(root, before);
  };
  return ui;
}

// render -> options
export function customRender(option: CustomRenderConf) {
  // 保存 options
  return function render<T>(Ctor: typeof Store, root: any) {
    const store = Ctor.new();
    // ui => bobe`` 返回的函数
    return [store['ui'](option, { data: store }, root), store];
  };
}
