import { Computed } from './computed';
import { Effect } from './effect';
import { Scope } from './scope';
import { Signal } from './signal';

export type OnClean = (isDestroy: boolean) => any;

export type SignalNode = Partial<
  Omit<Computed, 'callback'> & {
    dispose(): void;
  }
>;
export type Link = {
  execId: number;
  up: SignalNode;
  down: SignalNode;
  nextEmitLine: Link;
  prevEmitLine: Link;
  nextRecLine: Link;
  prevRecLine: Link;
};

export type OutLink = Link & {
  nextOutLink: OutLink;
  prevOutLink: OutLink;
};

export type SideEffect = Effect | Computed;

export enum ScheduleType {
  /** signal 变化后 同步执行 Effect */
  Sync = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  /** signal 变化后优先级最高的异步任务 */
  Pre = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  /** signal 变化后优先级第二高的异步任务 */
  Render = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  /** signal 变化后优先级第三高的异步任务 */
  Post = 0b0000_0000_0000_0000_0000_0000_0000_1000
}

export enum ScheduleStatus {
  /** 空闲 */
  Idle = 0,
  /** 准备运行 */
  Ready,
  /** 运行中 */
  Running
}