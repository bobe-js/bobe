import { Effect } from './effect';
import { State, Link, OutLink } from './type';
export class Scope {
  emitHead: Link = null;
  emitTail: Link = null;
  recHead: Link = null;
  recTail: Link = null;

  state = State.IsScope;
  scope: Effect | Scope = null;
  outLink: OutLink = null;
  constructor(public callback: () => any) {}
}
