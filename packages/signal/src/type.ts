import { Queue } from 'bobe-shared';
import { Line } from './line';
import type { Signal } from './signal';
export { Signal };

export type SignalType = 'ref' | 'auto' | 'proxy';

export enum Keys {
  Iterator = '__AOYE_ITERATOR',
  Raw = '__AOYE_RAW',
  Deep = '__AOYE_DEEP',
  Scope = '__AOYE_SCOPE',
}

export type TaskControlReturn = {
  /** 当前任务已完成 */
  finished?: boolean;
  /** 启动一个新 定时器 | RAF | Idle | 微任务 ... 等 */
  startNewCallbackAble?: boolean;
}

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

export type Dispose = {
  (): void;
  ins: Signal;
};
