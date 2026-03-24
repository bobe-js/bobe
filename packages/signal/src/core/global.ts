import { SignalNode } from './type';

let _execId = 0;
export const execIdInc = () => _execId++;
/** effect、computed 回调执行的唯一 id
 * 用于判断重复依赖属于同一 effect、effect、computed
 */
export const execId = () => _execId;

let _batchDeep = 0;
export const batchDeepInc = () => _batchDeep++;
export const batchDeepDec = () => _batchDeep--;
/** effect、computed 回调执行的唯一 id
 * 用于判断重复依赖属于同一 effect、effect、computed
 */
export const batchDeep = () => _batchDeep;

let pulling: SignalNode = null;
export const setPulling = (v: SignalNode) => (pulling = v);
export const getPulling = () => pulling;
