import { StackItem } from './type';
import type { MultiTypeStack } from './typed';

export const KEY_INDEX = '__BOBE_KEY_INDEX';
let _ctxStack: MultiTypeStack<StackItem>;
export const getCtxStack = () => _ctxStack;
export const setCtxStack = (stack: MultiTypeStack<StackItem>) => (_ctxStack = stack);
