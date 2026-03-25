import { Computed } from './computed';
import { Signal } from './signal';
import { Effect } from './effect';
import { dispose } from './operate';

export function $(data: any) {
  let set, get, s;
  if (typeof data === 'function') {
    s = new Computed(data);
    get = s.get.bind(s);
  } else {
    s = new Signal(data);
    set = s.set.bind(s);
    get = s.get.bind(s);
  }
  return {
    ins: s,
    get v() {
      return get();
    },
    set v(v) {
      set(v);
    }
  };
}

export function effect(fn) {
  const ef = new Effect(fn);
  ef.get();
  const run = dispose.bind(undefined, ef);
  run.ins = ef;
  return run;
}

// const a = new Signal(0);
// const b = new Computed(() => a.get() + 1);

// new Effect(() => {
//   console.log(b.get());
// }).get();

// a.set(1);
