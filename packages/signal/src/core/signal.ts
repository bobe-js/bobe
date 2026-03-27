import { Effect } from './effect';
import { getPulling } from './global';
import { link } from './line';
import { mark, flushEffect, batchDeep } from './operate';
import { Scope } from './scope';
import { Link, SignalNode } from './type';
import { State } from './macro' with { type: 'macro' };

export class Signal<T = any> {
  scope: Effect | Scope = getPulling() as any;
  emitHead: Link = null;
  emitTail: Link = null;
  state = State.Clean;

  constructor(public value: T) {}
  // TODO: shouldLink 考虑 signal -> computed NeedComputed -> effect 时执行 get 不应该触发 shouldLink
  get(shouldLink = true) {
    if (shouldLink) {
      const down = getPulling();
      // 在 watcher 的 callback 中执行，不连接
      if (down && (down.state & State.LinkScopeOnly) === 0) {
        link(this, down);
      }
    }
    return this.value;
  }
  set(v: T) {
    if (this.value === v) return;
    this.value = v;
    if (this.emitHead) {
      mark(this);
      if (batchDeep() === 0) {
        flushEffect();
      }
    }
  }
}
