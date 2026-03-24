import { Effect } from './effect';
import { batchDeep, getPulling } from './global';
import { link } from './line';
import { mark, flushEffect } from './operate';
import { Scope } from './scope';
import { State, Link, SignalNode } from './type';

export class Signal<T = any> {
  scope: Effect | Scope = null;
  emitHead: Link = null;
  emitTail: Link = null;
  state = State.Clean;

  constructor(public value: T) {}
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
