import { effect as _effect, CustomEffectOpt, Store, ValueDiff } from 'aoye';
import { Dep, isDep } from './type';
import { Tokenizer } from './tokenizer';
export { Store } from 'aoye';

const depTokenizer = new Tokenizer(() => '', false);

export const effect = (
  callback: (...args: ValueDiff[]) => void,
  depOrOpt?: Dep[] | Dep | CustomEffectOpt,
  opt?: CustomEffectOpt
) => {
  const isArray = Array.isArray(depOrOpt);
  const isSingleDep = isDep(depOrOpt);
  const deps = isArray ? depOrOpt : isSingleDep ? [depOrOpt] : [];
  const option = isArray || isSingleDep ? opt : depOrOpt;
  const newDeps: Dep[] = [];
  for (let i = 0; i < deps.length; i++) {
    const dep = deps[i];
    if (typeof dep === 'string') {
      depTokenizer.code = dep.trim()+'\n';
      let exp;
      while (depTokenizer.i < depTokenizer.code.length) {
        exp = depTokenizer.jsExp().value;
        depTokenizer.nextToken(); // 跳过分号
        newDeps.push(new Function('data', `let v;with(data){v=${exp};}return v;`).bind(undefined, Store.Current));
      }
    } else {
      newDeps.push(dep);
    }
  }

  return _effect(callback, newDeps, option);
};
