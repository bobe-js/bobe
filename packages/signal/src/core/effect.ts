import { execId, execIdInc, getPulling, setExecId, setPulling } from './global';
import { link } from './line';
import { transferDirtyState, pullDeep, unlink, dispose } from './operate';
import { Scope } from './scope';
import { Link, OnClean, OutLink, ScheduleType, SideEffect, SignalNode } from './type';
import { State } from './macro' with { type: 'macro' };

const EffectState = State.IsEffect | State.IsScope;
export class Effect {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;

  state = EffectState;
  scope: Effect | Scope = getPulling() as any;
  outLink: OutLink = null;
  clean: OnClean = null;
  constructor(public callback: (thisArg: Effect) => OnClean | void, public type: ScheduleType = ScheduleType.Sync) {
    this.get();
  }
  get(shouldLink = true, notForceUpdate = true) {
    if (this.state & State.ScopeAbort) return;
    const down = getPulling();
    if (this.recHead && notForceUpdate) {
      pullDeep(this);
    } else {
      this.state |= State.PullLock;

      setPulling(null);
      this.clean?.(false);
      this.clean = null;

      const nextId = execIdInc();
      const prevId = execId();
      setExecId(nextId);

      setPulling(this);
      this.recTail = null;
      const res = this.callback(this);
      typeof res === 'function' && (this.clean = res);
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
    // effect 可以嵌套管理，但是链接只建立一次
    if (!this.emitHead && shouldLink && down) {
      link(this, down);
    }
  }
}

export interface Effect {
  dispose(): void;
}

Effect.prototype.dispose = dispose;
