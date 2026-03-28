import { G } from './global';
import { deepSignal, shareSignal } from './deep-signal';
import { DeepOmitPath, IsStore, Key, PRecord, StoreIgnoreKeys } from './type';

export class Store {
  static [IsStore] = true;
  static [StoreIgnoreKeys]: Key[] = ['ui', 'raw'];
  static Current: Store = null;
  constructor() {
    const proxy = deepSignal(this, G.PullingSignal, true);
    Store.Current = proxy;
    return proxy;
  }
  parent: () => Store | null = () => null;

  static new<T extends Store = any, P extends Store = any, O extends string = ''>(
    this: new (...args: any[]) => T,
    keyMap: PRecord<keyof T, keyof Omit<P, O> | DeepOmitPath<P, O>> = {},
    staticMap: PRecord<keyof T, any> = {}
  ): T {
    const parentStore = Store.Current;
    const child = new (this as any)();
    if (parentStore) {
      for (const childKey in keyMap) {
        const parentKey: string = keyMap[childKey] as any;
        shareSignal(parentStore, parentKey, child, childKey);
      }
    }
    for (const key in staticMap) {
      const value = staticMap[key];
      child[key] = value;
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
