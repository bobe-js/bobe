import { Scope, Signal, batchEnd, batchStart } from './core';
import { Keys } from './type';
import { deepSignal } from './deep-signal';

/*----------------- 辅助函数 -----------------*/

export const trackIterator = (cells: Map<any, Signal>, scope: Scope) => {
  let iter = cells.get(Keys.Iterator);
  if (!iter) {
    iter = new Signal(0);
    iter.scope = scope;
    cells.set(Keys.Iterator, iter);
  }
  iter.get();
};

const triggerIterator = (cells: Map<any, Signal>) => {
  const iter = cells.get(Keys.Iterator);
  if (iter) {
    iter.set((iter.value || 0) + 1);
  }
};

const trackKey = (cells: Map<any, Signal>, scope: Scope, key: any) => {
  let cell = cells.get(key);
  if (!cell) {
    cell = new Signal(undefined);
    cell.scope = scope;
    cells.set(key, cell);
  }
  cell.get();
};

const triggerKey = (cells: Map<any, Signal>, key: any) => {
  const cell = cells.get(key);
  if (cell) {
    cell.set((cell.value === undefined ? 0 : cell.value) + 1);
  }
};

/*----------------- Map/Set 共享方法 -----------------*/
/**
 * size, clear, delete, has, keys, values, entries, forEach, [Symbol.iterator]
 */
export const createSharedHandler = (cells: Map<any, Signal>, scope: Scope, deep: boolean, targetIsMap: boolean) => {
  const iterate = (rawTarget: Map<any, any> | Set<any>, iteratorFn: string) => {
    trackIterator(cells, scope);
    const rawIter = (rawTarget as any)[iteratorFn]();
    if (!deep) return rawIter;

    const rawNext = rawIter.next.bind(rawIter);
    rawIter.next = () => {
      const result = rawNext();
      if (!result.done) {
        // entries 返回 [k, v]，key 也可能是对象需要包装；keys/values 包装值本身
        if (iteratorFn === 'entries') {
          result.value[0] = deepSignal(result.value[0], scope);
          result.value[1] = deepSignal(result.value[1], scope);
        } else {
          result.value = deepSignal(result.value, scope);
        }
      }
      return result;
    };
    return rawIter;
  };

  return {
    has(key: any) {
      const target = this[Keys.Raw];
      trackKey(cells, scope, key);
      return target.has(key);
    },

    delete(key: any) {
      const target = this[Keys.Raw];
      batchStart();
      const had = target.has(key);
      const result = target.delete(key);
      if (had) {
        triggerKey(cells, key);
        cells.delete(key);
        triggerIterator(cells);
      }
      batchEnd();
      return result;
    },

    clear() {
      const target = this[Keys.Raw];
      batchStart();
      const hadItems = target.size > 0;
      target.clear();
      // 清除 key cells（保留 Iterator）
      const iterCell = cells.get(Keys.Iterator);
      cells.clear();
      if (iterCell) cells.set(Keys.Iterator, iterCell);
      if (hadItems) {
        triggerIterator(cells);
      }
      batchEnd();
    },

    forEach(callback: Function, thisArg?: any) {
      const target = this[Keys.Raw];
      trackIterator(cells, scope);
      const wrap = (val: any) => (deep ? deepSignal(val, scope) : val);
      // Map callback: (value, key, map)
      // Set callback: (value, key, set) — key===value, rawToProxy 缓存保证不重复包装
      target.forEach((v: any, k: any) => {
        callback.call(thisArg, wrap(v), wrap(k), this);
      });
    },

    keys() {
      return iterate(this[Keys.Raw], 'keys');
    },

    values() {
      return iterate(this[Keys.Raw], 'values');
    },

    entries() {
      return iterate(this[Keys.Raw], 'entries');
    },

    [Symbol.iterator]() {
      // Map 同 entries，Set 同 values
      return iterate(this[Keys.Raw], targetIsMap ? 'entries' : 'values');
    }
  };
};

/*----------------- Map 专用方法 -----------------*/
/**
 * get(key), set(key, value)
 */
export const createMapHandler = (cells: Map<any, Signal>, scope: Scope, deep: boolean) => ({
  get(key: any) {
    const target = this[Keys.Raw];
    trackKey(cells, scope, key);
    const value = target.get(key);
    return deep ? deepSignal(value, scope) : value;
  },

  set(key: any, value: any) {
    const target = this[Keys.Raw];
    batchStart();
    target.set(key, value);
    // 更新 key cell
    let cell = cells.get(key);
    if (!cell) {
      cell = new Signal(value);
      cell.scope = scope;
      cells.set(key, cell);
    } else {
      cell.set(value);
    }
    // 新增或修改已有 key 都触发 Iterator，因为迭代器（forEach/entries 等）依赖值变化
    triggerIterator(cells);
    batchEnd();
    return this;
  }
});

/*----------------- Set 专用方法 -----------------*/
/**
 * add(value)
 */
export const createSetHandler = (cells: Map<any, Signal>, scope: Scope, _deep: boolean) => ({
  add(value: any) {
    const target = this[Keys.Raw];
    batchStart();
    const had = target.has(value);
    target.add(value);
    // 更新 value cell（Set 用 value 自身作为 key）
    let cell = cells.get(value);
    if (!cell) {
      cell = new Signal(value);
      cell.scope = scope;
      cells.set(value, cell);
    } else {
      cell.set(value);
    }
    if (!had) {
      triggerIterator(cells);
    }
    batchEnd();
    return this;
  }
});

/*----------------- 合并处理器的辅助函数 -----------------*/

export const mergeHandlers = (...handlers: Record<string | symbol, any>[]) =>
  Object.assign({}, ...handlers);
