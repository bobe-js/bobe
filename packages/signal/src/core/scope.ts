import { Effect } from './effect';
import { execIdInc, getPulling, setPulling } from './global';
import { link } from './line';
import { State, Link, OutLink } from './type';
export class Scope {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;

  state = State.IsScope;
  scope: Effect | Scope = null;
  outLink: OutLink = null;
  clean?: () => void;
  constructor(public callback: () => any) {}
  get(shouldLink = true) {
    const { scope } = this;
    if (scope && scope.state & State.ScopeAbort) return;
    const down = getPulling();

    this.state |= State.PullLock;
    setPulling(this);
    this.recTail = null;
    execIdInc();
    this.clean = this.callback();
    this.state &= ~State.PullLock;
    setPulling(down);

    // effect 可以嵌套管理，但是链接只建立一次
    if (!this.emitHead && shouldLink && down && (down.state & State.LinkScopeOnly) === 0) {
      link(this, down);
    }
  }
}
