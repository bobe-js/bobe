import { setPulling, getPulling, execIdInc } from './global';
import { Effect } from './effect';
import { Scope } from './scope';
import { State, Link, DirtyState } from './type';
import { transferDirtyState, pullDeep } from './operate';
import { link } from './line';

export class Computed<T = any> {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;
  state = State.Clean;
  scope: Effect | Scope = null;
  value: T = null;
  constructor(public callback: () => T) {}
  get(shouldLink = true, notForceUpdate = true) {
    if (this.scope && this.scope.state & State.ScopeAbort) return this.value;
    const down = getPulling();
    if (this.recHead && notForceUpdate) {
      if (this.state & DirtyState) {
        this.value = pullDeep(this);
      }
    } else {
      this.state |= State.PullLock;
      setPulling(this);
      this.recTail = null;
      execIdInc();
      this.value = this.callback();
      // TODO: 清理依赖
      this.state &= ~State.PullLock;
      setPulling(down);
      // Unknown 转换
      transferDirtyState(this, this.state);
    }

    // link 连接
    if (shouldLink && down && (down.state & State.LinkScopeOnly) === 0) {
      link(this, down);
    }
    return this.value;
  }
}
