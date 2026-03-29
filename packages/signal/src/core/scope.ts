import { Effect } from './effect';
import { getPulling, setPulling } from './global';
import { link } from './line';
import { Link, OnClean, OutLink } from './type';
import { State } from './macro' with { type: 'macro' };
import { dispose } from './operate';
const ScopeAndLinkScopeOnly = State.IsScope | State.LinkScopeOnly;
export class Scope {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;

  state = ScopeAndLinkScopeOnly;
  scope: Effect | Scope = getPulling() as any;
  outLink: OutLink = null;
  clean: OnClean = null;
  constructor(public callback: () => OnClean | any) {}
  get(shouldLink = true) {
    const { scope } = this;
    this.state |= State.PullLock;
    setPulling(this);
    this.recTail = null;
    const res = this.callback();
    typeof res === 'function' && (this.clean = res);
    this.state &= ~State.PullLock;
    setPulling(scope);

    // effect 可以嵌套管理，但是链接只建立一次
    if (!this.emitHead && shouldLink && scope) {
      link(this, scope);
    }
  }
}
export interface Scope {
  dispose(): void;
}

Scope.prototype.dispose = dispose;
