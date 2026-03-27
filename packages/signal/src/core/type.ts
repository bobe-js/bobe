import { Computed } from './computed';
import { Effect } from './effect';
import { Scope } from './scope';
import type { State } from './macro';


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



export type SideEffect = Effect | Computed;

export type ValueDiff = {
  old: any;
  val: any;
};
