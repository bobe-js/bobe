import { setPulling, getPulling, execIdInc, execId, setExecId } from './global';
import { Effect } from './effect';
import { Scope } from './scope';
import { Link, OutLink } from './type';
import { State, DirtyState } from './macro' with { type: 'macro' };
import { transferDirtyState, pullDeep, unlink } from './operate';
import { link } from './line';

export class Computed<T = any> {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;
  state = State.Clean;
  scope: Effect | Scope = getPulling() as any;
  value: T = null;
  constructor(public callback: () => T) {}
  get(shouldLink = true, notForceUpdate = true) {
    const { scope } = this;
    if (scope && scope.state & State.ScopeAbort) return this.value;
    const down = getPulling();
    if (this.recHead && notForceUpdate) {
      if (this.state & DirtyState) {
        this.value = pullDeep(this);
      }
    } else {
      this.state |= State.PullLock;

      const nextId = execIdInc();
      const prevId = execId();
      setExecId(nextId);

      setPulling(this);
      this.recTail = null;
      this.value = this.callback();
      this.state &= ~State.PullLock;
      setPulling(down);

      setExecId(prevId);
      // Unknown 转换
      transferDirtyState(this, this.state);
      let line = this.recTail?.nextRecLine;
      while (line) {
        const nextLine = line.nextRecLine;
        unlink(line as OutLink, true);
        line = nextLine;
      }
    }

    // link 连接
    if (shouldLink && down && (down.state & State.LinkScopeOnly) === 0) {
      link(this, down);
    }
    return this.value;
  }
}
