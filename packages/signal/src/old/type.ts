import { Queue } from 'bobe-shared';
import { Line } from './line';
import type { Signal } from './signal';
export { Signal };

export type SignalType = 'ref' | 'auto' | 'proxy';

export enum Keys {
  Iterator = '__AOYE_ITERATOR',
  Raw = '__AOYE_RAW',
  Meta = '__AOYE_META'
}
export type Key = string | number | symbol;
/** store 标识 */
export const IsStore = Symbol('__AOYE_IS_STORE'),
  StoreIgnoreKeys = Symbol('__AOYE_IGNORE_KEYS');

export type TaskControlReturn = {
  /** 当前任务已完成 */
  finished?: boolean;
  /** 启动一个新 定时器 | RAF | Idle | 微任务 ... 等 */
  startNewCallbackAble?: boolean;
};

export type Task = {
  (): TaskControlReturn | void;
  [key: string]: any;
};

export type CreateTaskProps = {
  callbackAble: (fn: Function) => any;
  aIsUrgent: (a: Task, b: Task) => boolean;
};
export type ScheduleHandler = (effects: Queue<Signal>) => any;
export type SignalOpt<T> = {
  customPull?: () => T;
  scheduler?: string;
  isScope?: boolean;
  scope?: Signal;
  immediate?: boolean;
};

export type Vertex = {
  /** 上游来的最后一条线 */
  recEnd: Line;
  recStart: Line;
  /** 向下游发出的最后一条线 */
  emitEnd: Line;
  emitStart: Line;
};

export type DFSCtxBegin = {
  node: Signal;
  lineFromUp: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

export type DFSCtxCompete = {
  node: Signal;
  lineToDeep: Line;
  walkedLine: Line[];
  notGoDeep?: boolean;
};

export type Getter<T = any> = {
  (): T;
  ins?: Signal;
};

export type Mix<T = any> = {
  (v: T): void;
  (): T;
  v: T;
  stop(): void;
};

export type ValueDiff = {
  old: any;
  val: any;
};

export type CreateScope = (customPull: () => void, scope?: Signal) => Dispose;

export type Dispose = {
  (): void;
  ins: Signal;
};

// 定义一个递减器，用来控制深度
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type DeepPath<T, Depth extends number = 8> = [Depth] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: [K] | [K, ...DeepPath<T[K], Prev[Depth]>];
      }[keyof T]
    : never;

export type DeepOmitPath<T, K extends string> = DeepPath<Omit<T, K>, 8>;
export type PRecord<K extends string | symbol | number, V> = Partial<Record<K, V>>;
export type DeepValue<T, P> = P extends [infer Head, ...infer Tail]
  ? Head extends keyof T
    ? Tail extends []
      ? T[Head]
      : DeepValue<T[Head], Tail>
    : never
  : never;

export type MatchValue<V1, T2, P2> = (DeepValue<T2, P2> extends V1 ? P2 : never)  