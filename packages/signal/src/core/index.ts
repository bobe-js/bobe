import { Computed } from './computed';
import { Signal } from './signal';
import { Effect } from './effect';
import { Scope, NoopEffect, noopEffect } from './scope';

export { Signal, Computed, Effect, Scope, NoopEffect, noopEffect };
export { clean, batchStart, batchEnd } from './operate';
export * from './global';
export * from './type';

// const a = new Signal(0);
// const b1 = new Computed(() => a.get() + 1);
// const b2 = new Computed(() => a.get() + 2);

// const c = new Computed(() => b1.get() + b2.get());


// new Effect(() => {
//   console.log(c.get());
// }).get();

// a.set(1);
