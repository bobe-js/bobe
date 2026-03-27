import { Computed } from './computed';
import { Signal } from './signal';
import { Effect } from './effect';
import { dispose } from './operate';
import { Scope } from './scope';
import { ValueDiff } from './type';
import { State } from './macro' with { type: 'macro' };

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

const DefaultCustomEffectOpt = {
  immediate: true
};

export type CustomEffectOpt = Partial<typeof DefaultCustomEffectOpt>;

export function effect(
  callback: (...args: ValueDiff[]) => void,
  depOrOpt?: any[] | CustomEffectOpt,
  opt?: CustomEffectOpt
) {
  /*----------------- 自动收集 -----------------*/
  const hasDep = Array.isArray(depOrOpt);
  opt = hasDep ? opt || {} : depOrOpt || {};
  if (!hasDep) {
    const ef = new Effect(callback);
    ef.get();
    const run = dispose.bind(undefined, ef);
    run.ins = ef;
    return run;
  }
  /*----------------- 指定依赖， watcher -----------------*/
  let mounted = false;
  const deps = depOrOpt as any[];
  const immediate = deps.length === 0 ? true : (opt.immediate ?? true);
  const vs: ValueDiff[] = Array.from({ length: deps.length }, () => ({ old: null, val: null }));

  const ef = new Effect(() => {
    for (let i = 0; i < deps.length; i++) {
      const value = deps[i].v;
      vs[i].old = vs[i].val;
      vs[i].val = value;
    }

    if (mounted || immediate) {
      ef.state |= State.LinkScopeOnly;
      callback(...vs);
      ef.state &= ~State.LinkScopeOnly;
    }
    mounted = true;
  });

  ef.get();
  const run = dispose.bind(undefined, ef);
  run.ins = ef;
  return run;
}
export function scope(...args) {
  const scopeIns = new Scope(args[0]);
  if (args.length === 2) {
    scopeIns.scope = args[1];
  }
  scopeIns.get();
  const run = dispose.bind(undefined, scopeIns);
  run.ins = scopeIns;
  return run;
}
export { Signal, Computed, Effect, Scope };
export { clean, batchStart, batchEnd } from './operate';
export * from './global';

// const a = new Signal(0);
// const b1 = new Computed(() => a.get() + 1);
// const b2 = new Computed(() => a.get() + 2);

// const c = new Computed(() => b1.get() + b2.get());


// new Effect(() => {
//   console.log(c.get());
// }).get();

// a.set(1);
