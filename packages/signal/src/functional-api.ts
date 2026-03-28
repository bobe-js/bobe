import { Computed, Effect, getPulling, Scope, Signal } from './core';
import { State } from './core/macro' with { type: 'macro' };
import { ValueDiff } from './type';
import { deepSignal } from './deep-signal';

export function $(data: any) {
  if (typeof data === 'object' && data !== null) {
    return deepSignal(data, getPulling());
  }
  if (typeof data === 'function') {
    const s = new Computed(data),
      get = s.get.bind(s);
    return {
      ins: s,
      get v() {
        return get();
      }
    };
  } else {
    const s = new Signal(data),
      set = s.set.bind(s),
      get = s.get.bind(s);
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
}

const DefaultCustomEffectOpt = {
  immediate: true
};

export type CustomEffectOpt = Partial<typeof DefaultCustomEffectOpt>;

export function effectUt(
  callback: (...args: ValueDiff[]) => void,
  depOrOpt?: any[] | CustomEffectOpt,
  opt?: CustomEffectOpt
) {
  /*----------------- 自动收集 -----------------*/
  const hasDep = Array.isArray(depOrOpt);
  opt = hasDep ? opt || {} : depOrOpt || {};
  if (!hasDep) {
    const ef = new Effect(callback);
    const run = ef.dispose.bind(ef);
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
  const run = ef.dispose.bind(ef);
  run.ins = ef;
  return run;
}

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
    const run = ef.dispose.bind(ef);
    run.ins = ef;
    return run;
  }
  /*----------------- 指定依赖， watcher -----------------*/
  let mounted = false;
  const deps = depOrOpt as any[];
  const immediate = deps.length === 0 ? true : (opt.immediate ?? true);
  const vs: ValueDiff[] = Array.from({ length: deps.length }, () => ({ old: null, val: null }));

  const ef = new Effect(eff => {
    for (let i = 0; i < deps.length; i++) {
      const value = deps[i].get();
      vs[i].old = vs[i].val;
      vs[i].val = value;
    }

    if (mounted || immediate) {
      eff.state |= State.LinkScopeOnly;
      callback(...vs);
      eff.state &= ~State.LinkScopeOnly;
    }
    mounted = true;
  });
  const run = ef.dispose.bind(ef);
  run.ins = ef;
  return run;
}
export function scope(...args) {
  const ins = new Scope(args[0]);
  if (args.length === 2) {
    ins.scope = args[1];
  }
  ins.get();
  const run = ins.dispose.bind(ins);
  run.ins = ins;
  return run;
}
