import { Computed } from './core/computed';
import { getPulling } from './core';
import { deepSignal, shareSignal } from './deep-signal';
import { DeepOmitPath, IsStore, Key, Keys, PRecord, StoreIgnoreKeys } from './type';

/** 判断 expr 是否是 parentStore 上的一个 key（仅浅层，不涉及深度路径） */
const isParentKey = (parentStore: any, expr: string) => expr in parentStore[Keys.Raw];

export class Store {
  static [IsStore] = true;
  static [StoreIgnoreKeys]: Key[] = ['ui', 'raw'];
  static Current: Store = null;
  constructor() {
    const proxy = deepSignal(this, getPulling(), true);
    Store.Current = proxy;
    return proxy;
  }
  parent: () => Store | null = () => null;

  /**
   * 创建子 Store 实例并传递属性：
   * Store.new({ prop1: `v1+v2`, prop2: (p) => p.v3 * p.v4 }, { prop3: 123 })
   *
   * keyMap：childKey → 表达式
   *   - string：解析为 with(parentStore) { ... } 表达式，结果包装为 Computed
   *   - Function：直接包装为 Computed(() => fn(parentStore))
   *
   * staticMap：childKey → 静态值，直接赋值
   */
  static new<T extends Store = any, P extends Store = any, O extends string = ''>(
    this: new (...args: any[]) => T,
    keyMap?: PRecord<keyof T, keyof Omit<P, O> | DeepOmitPath<P, O>> | Record<string, string | Function>,
    staticMap?: PRecord<keyof T, any>
  ): T {
    const parentStore = Store.Current;
    const child = new (this as any)();
    if (parentStore && keyMap) {
      const cells: Map<string, any> = child[Keys.Meta].cells;
      for (const childKey in keyMap) {
        const expr = (keyMap as Record<string, any>)[childKey];

        if (typeof expr === 'function') {
          // 函数表达式 → Computed
          cells.set(childKey, new Computed(() => expr(parentStore)));
          child[Keys.Raw][childKey] = undefined;
        } else if (typeof expr === 'string') {
          // 字符串：若 parentStore 上存在同名 key → shareSignal 双向共享；
          // 否则视为 JS 表达式 → Computed 单向传递
          if (isParentKey(parentStore, expr)) {
            shareSignal(parentStore, expr, child, childKey);
          } else {
            const fn = new Function('data', `let v;with(data){v=${expr};}return v;`);
            cells.set(childKey, new Computed(() => fn(parentStore)));
            child[Keys.Raw][childKey] = undefined;
          }
        } else {
          // 数组：旧版 deep path，走 shareSignal 双向共享
          shareSignal(parentStore, expr as string, child, childKey);
        }
      }
    }
    for (const key in staticMap) {
      child[key] = staticMap[key];
    }
    child.parent = () => parentStore;
    Store.Current = parentStore;
    return child;
  }

  map<P extends Store = any, O extends string = ''>(
    keyMap: PRecord<keyof this, keyof Omit<P, O> | DeepOmitPath<P, O>> = {}
  ) {
    const parentStore = this.parent();
    if (parentStore) {
      for (const childKey in keyMap) {
        const parentKey: string = keyMap[childKey] as any;
        shareSignal(parentStore, parentKey, this, childKey);
      }
    }
    this.parent = null;
  }
}

export const isStore = (s: any): s is typeof Store => typeof s === 'function' && s[IsStore];
