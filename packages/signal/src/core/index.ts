import { Computed } from './computed';
import { Signal } from './signal';
import { Effect } from './effect';

const a = new Signal(0);
const b = new Computed(() => a.get() + 1);

new Effect(() => {
  console.log(b.get());
}).get();

a.set(1);