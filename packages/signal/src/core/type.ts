import { Computed } from './computed';
import { Effect } from './effect';
import { Scope } from './scope';

export enum State {
  Clean = 0,
  /** Computed 首屏时一定要执行 */
  IsEffect = 0b0000_0000_0000_0000_0000_0010_0000_0000,
  /** watch 节点执行 watcher 时只连接 scope */
  LinkScopeOnly = 0b0000_0000_0000_0000_0000_0001_0000_0000,
  /** 仅用于 scope 节点是否 abort */
  ScopeAbort = 0b0000_0000_0000_0000_0000_0000_1000_0000,
  /** 仅用于 scope 节点是否 ready */
  ScopeReady = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  /** 当前节点是 scope 节点 */
  IsScope = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  /** 当前节点正在 pull 递归中标记为 dirty, 保证 pulling 过程中不影响 dirty 传播 */
  PullingNeedCompute = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  /** 当前节点正在 pull 递归中标记为 unknown, 保证 pulling 过程中不影响 dirty 传播 */
  PullingUnknown = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  /** 当前节点可能变化 */
  Unknown = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  /** 节点需要重新计算 */
  NeedCompute = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  /** 给正在拉取的节点上 PullLock 锁 */
  PullLock = 0b0000_0000_0000_0000_0000_0000_0000_0001
}

export type SignalNode = {
  emitHead?: Link;
  emitTail?: Link;
  recHead?: Link;
  recTail?: Link;
  state: State;
  scope: Effect | Scope;
};
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

export const DirtyState = State.Unknown | State.NeedCompute;
export const ScopeExecuted = State.ScopeReady | State.ScopeAbort;

export const UnknownOrScopeExecuted = State.ScopeReady | State.ScopeAbort | State.Unknown;
export const PullingOrScopeExecuted = State.ScopeReady | State.ScopeAbort | State.PullLock;
export const ScopeAbort = State.ScopeAbort;

export type SideEffect = Effect | Computed;
