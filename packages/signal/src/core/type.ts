import { Computed } from './computed';
import { Effect } from './effect';
import { Scope } from './scope';
import { Signal } from './signal';


export type OnClean = (isDestroy: boolean) => any;

export type SignalNode = Partial<Omit<Computed, 'callback'> & {
  dispose(): void;
}>;
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
