import { Dispose, Signal, Store } from 'aoye';
import type { Tokenizer } from './tokenizer';
import type { Interpreter } from './terp';
import type { TypedStack } from './typed-stack';

export enum TokenType {
  NewLine = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  Indent = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  Dedent = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  Identifier = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Assign = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Pipe = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  Eof = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  InsertionExp = 0b0000_0000_0000_0000_0000_0000_1000_0000
}

export enum LogicType {
  If = 0b0000_0000_0000_0000_0000_0000_0000_0001,
  Fail = 0b0000_0000_0000_0000_0000_0000_0000_0010,
  Else = 0b0000_0000_0000_0000_0000_0000_0000_0100,
  For = 0b0000_0000_0000_0000_0000_0000_0000_1000,
  Component = 0b0000_0000_0000_0000_0000_0000_0001_0000,
  Fragment = 0b0000_0000_0000_0000_0000_0000_0010_0000,
  Root = 0b0000_0000_0000_0000_0000_0000_0100_0000,
  // 仅占位
  Real = 0b0000_0000_0000_0000_0000_0000_1000_0000
}

export const Logical = LogicType.If | LogicType.Fail | LogicType.Else | LogicType.For;

export const CondType = LogicType.If | LogicType.Fail | LogicType.Else;

export enum NodeType {
  Logic = Logical,
  Real = LogicType.Real,
  Component = LogicType.Component
}

export enum TerpEvt {
  AllAttrGot = 'all-attr-got',
  HandledComponentNode = 'handled-component-node'
}

export type BaseType = string | number | boolean | undefined | null;

export const InsComputed = Symbol('insertion-computed-map-key');
export const IsAnchor = Symbol('is-anchor');

export type Token = {
  type: TokenType;
  typeName: string;
  value: BaseType;
};

export type HookProps = {
  /** 通过哪个 HookId 进入的 */
  HookId: string;
  /**  第几个 hook */
  i: number;
  /** 父节点 */
  parentNode?: any;
};

export type TerpConf = Partial<
  Pick<
    Interpreter,
    | 'createNode'
    | 'setProp'
    | 'insertAfter'
    | 'remove'
    | 'createAnchor'
    | 'firstChild'
    | 'nextSib'
    | 'hook'
    | 'HookId'
    | 'data'
  >
>;
export type CustomRenderConf = Pick<
  TerpConf,
  'createNode' | 'setProp' | 'insertAfter' | 'remove' | 'createAnchor' | 'firstChild' | 'nextSib'
>;

export type Hook = (props: HookProps) => any;

export type HookType = 'dynamic' | 'static';

export type ProgramCtx = {
  stack: TypedStack<any, NodeType>;
  prevSibling: any;
  realParent: any;
  current: any;
  before: any;
};

/** 返回值是用户自定义的节点 */
export type BobeUI = (
  this: Store,
  options: CustomRenderConf,
  valOpt: TerpConf,
  root: any,
  after?: any
) => ComponentNode;

export type StackItem = {
  /** 插入到 prev 后 */
  prev: any;
  /** 当前节点*/
  node: any;
};

export type IfNode = LogicNode & {
  condition: Signal;
  isFirstRender: boolean;
  snapshot: ReturnType<Tokenizer['snapshot']>;
  effect: Dispose;
  preCond: IfNode | null;
};

export type LogicNode = {
  __logicType: LogicType;
  realParent: any;
  realBefore?: any;
  realAfter?: any;
  lastInserted?: any;
};

export type FragmentNode = LogicNode & {};
export type ComponentNode = LogicNode & {
  store: Store;
};
export type RootNode = LogicNode & {
  store: Store;
};
