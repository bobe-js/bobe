import { execIdInc, getPulling, setPulling } from './global';
import { link } from './line';
import { transferDirtyState, pullDeep } from './operate';
import { Scope } from './scope';
import { State, Link, OutLink } from './type';

const EffectState = State.IsEffect | State.IsScope;
export class Effect {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;

  state = EffectState;
  scope: Effect | Scope = null;
  outLink: OutLink = null;
  constructor(public callback: () => any) {}
  get(shouldLink = true, notForceUpdate = true) {
    if (this.scope && this.scope.state & State.ScopeAbort) return;
    const down = getPulling();
    if (this.recHead && notForceUpdate) {
      pullDeep(this);
    } else {
      this.state |= State.PullLock;
      setPulling(this);
      this.recTail = null;
      execIdInc();
      this.callback();
      this.state &= ~State.PullLock;
      setPulling(down);
      // Unknown 转换
      transferDirtyState(this, this.state);
      // TODO: 清理依赖
    }
    // effect 可以嵌套管理，但是链接只建立一次
    if (!this.emitHead && shouldLink && down && (down.state & State.LinkScopeOnly) === 0) {
      link(this, down);
    }
  }
}
