import { getCtxStack } from './global';
import { NodeSort } from './type';

export type IContext = {
  <T = any>(name: string): T;
  <T = any>(): T;
};
export const context: IContext = (name?: string) => {
  const stack = getCtxStack();
  if (!stack) {
    throw new Error('context() api 只能在组件中使用');
  }

  let context = stack.peekByType(NodeSort.Context)?.node?.context;

  if (name) {
    context = context?.[name];
  }

  if (!context) {
    console.warn(`context(${name ?? ''}) 为空`);
  }

  return context as any;
};
