import { Tokenizer } from './tokenizer';
import { $, effect, getPulling, Keys, runWithPulling, setPulling, shareSignal, Signal, Store } from 'aoye';
import {
  BobeUI,
  ComponentNode,
  CondType,
  CustomRenderConf,
  FragmentNode,
  Hook,
  HookProps,
  HookType,
  IfNode,
  IsAnchor,
  Logical,
  LogicNode,
  LogicType,
  NodeType,
  ProgramCtx,
  StackItem,
  TerpConf,
  TerpEvt,
  Token,
  TokenType
} from './type';
import { BaseEvent } from 'bobe-shared';
import { TypedStack } from './typed-stack';
const tap = new BaseEvent();

export class Interpreter {
  /** 模板字符串动态节点的占位符 */
  HookId = '_h_o_o_k_';
  /** 用于渲染的数据 */
  data: Record<any, any> = {};
  /** 模板字符串动态节点索引 */
  hookI = 0;
  opt: TerpConf;
  constructor(private tokenizer: Tokenizer) {}
  isLogicNode(node: any) {
    return node && node.__logicType & Logical;
  }

  program(root: any, before?: any) {
    const componentNode: ComponentNode = {
      __logicType: LogicType.Component,
      realParent: root,
      store: new Store()
    };
    this.tokenizer.consume();
    const stack = new TypedStack<StackItem, NodeType>();
    stack.push({ node: root, prev: null }, NodeType.Real);

    const ctx: ProgramCtx = {
      realParent: root,
      prevSibling: before,
      current: null,
      stack,
      before
    };

    const rootPulling = getPulling();
    while (1) {
      if (this.tokenizer.isEof()) {
        if (!ctx.prevSibling) ctx.prevSibling = before;
        this.handleInsert(root, ctx.current, ctx.prevSibling, componentNode);
        break;
      }

      const token = this.tokenizer.token;
      // 下沉，创建 child0
      if (token.type & TokenType.Indent) {
        const INDENT = this.tokenizer.consume();
        const isLogicNode = this.isLogicNode(ctx.current);
        stack.push(
          {
            node: ctx.current,
            prev: ctx.prevSibling
          },
          ctx.current.__logicType ? (isLogicNode ? NodeType.Logic : NodeType.Component) : NodeType.Real
        );
        if (ctx.current.__logicType) {
          // 父节点是逻辑节点
          if (isLogicNode) {
            // 保证 if 子逻辑节点能被其 effect 管理
            setPulling(ctx.current.effect.ins);
          }
        }
        // 父节点是原生节点时才修改 ctx.prevSibling
        else {
          if (ctx.current) {
            ctx.realParent = ctx.current;
          }
          ctx.prevSibling = null;
        }
        ctx.current = this.declaration(ctx);
        continue;
      }
      // Token 不论指示找 下一个同级节点，还是 Dedent, 都将当前节点插入
      if (ctx.current) {
        // root 下第一个子节点应该插入在 before 之后
        if (stack.length === 1 && !ctx.prevSibling) {
          ctx.prevSibling = before;
        }
        this.handleInsert(ctx.realParent, ctx.current, ctx.prevSibling);
      }
      // 下一个 token 是 Dedent
      if (this.tokenizer.token.type & TokenType.Dedent) {
        const DEDENT = this.tokenizer.consume();
        const { node: parent, prev } = stack.peek();
        // 弹出原生节点，找最近的 ctx.realParent
        if (!parent.__logicType) {
          const prevSameType = stack.getPrevSameType();
          ctx.realParent = prevSameType?.node || root;
        }
        // 弹出逻辑节点，
        else {
          // 考虑 if, for 等获取最后一个插入节点
          if (this.isLogicNode(parent)) {
            // 找最近的 if for
            const parentLogic = stack.getPrevSameType()?.node;
            if (parentLogic) {
              setPulling(parentLogic.effect.ins);
            } else {
              setPulling(rootPulling);
            }
          }
        }
        stack.pop();
        ctx.prevSibling = prev;
        ctx.current = parent;
      }
      // 下一个是 同级节点
      else {
        ctx.prevSibling = ctx.current || ctx.prevSibling;
        ctx.current = this.declaration(ctx);
      }
    }
    return componentNode;
  }

  insertAfterAnchor(ctx: ProgramCtx) {
    const { realParent, prevSibling, stack, before } = ctx;
    // 先将 after 插入
    const afterAnchor = this.createAnchor();
    ctx.prevSibling = stack.length === 1 && !prevSibling ? before : prevSibling;
    this.handleInsert(realParent, afterAnchor, prevSibling);
    return afterAnchor;
  }

  /** 处理
   *                    是逻辑                               是普通
   * 父节点       将子节点加入 directList         调用 insert 方法挨个插入子节点
   * 子节点           仅插入到父逻辑节点              将本节点插入父节点
   * 理论上父节点不能是一个 逻辑节点，遇到if 时 Terp 会重新执行 program 这种情况下，会指定 root 为真实 dom
   */
  handleInsert(parent: any, child: any, prev: any, parentComponent?: any) {
    // 父 是 逻辑节点
    if (parentComponent) {
      // parentComponent.directList.push(child);
    }
    // 子 普通节点
    if (!child.__logicType) {
      // 前置节点空 或 普通节点
      if (!prev || !prev.__logicType) {
        this.insertAfter(parent, child, prev);
      }
      // 前置节点是逻辑节点，必定有 after
      else {
        const before = prev.realAfter;
        this.insertAfter(parent, child, before);
      }
    }
    // 子 是 逻辑节点
    else {
      const childCmp: LogicNode = child;
      childCmp.realParent = parent;
      // 前置 -> 逻辑节点
      if (prev?.__logicType) {
        childCmp.realBefore = prev.realAfter;
      }
      // 前置 -> 普通节点
      else {
        childCmp.realBefore = prev;
      }
    }
  }

  /** 考虑到同级 逻辑模块 */
  getPrevRealSibling(prevSibling: any) {
    // 正常节点则直接返回
    if (!prevSibling || !prevSibling.__logicType) {
      return prevSibling;
    }
    let point = prevSibling;
    while (point != null) {
      if (point.lastChild) {
        return point.lastChild.value;
      }
      point = point.anchor;
    }
  }

  /**
   * 声明部分：
   * 包含首行定义和（可选的）多行属性扩展
   * <declaration> ::= <tagName=token> <headerLine> <extensionLines>
   *  */
  declaration(ctx: ProgramCtx) {
    const [hookType, value] = this._hook({});
    let _node: any;

    if (value === 'if' || value === 'else' || value === 'fail') {
      return this.condDeclaration(ctx);
    } else if (hookType) {
      // 静态 1. Component，2. bobe 返回的 render 方法
      if (hookType === 'static') {
        // 传组件 class
        if (typeof value === 'function' && value.prototype instanceof Store) {
          _node = this.componentDeclaration(value, ctx);
        }
        // 传组件片段
        else if (typeof value === 'function') {
          _node = this.fragmentDeclaration(value);
        }
        // 其余类型不允许静态插值
        else {
          throw new SyntaxError(`declaration 不支持 ${value} 类型的静态插值`);
        }
      }
      // 动态插值
      // 一定是 js 表达式
      // 1. 返回基础值，创建文本节点 createNode('text', String(value))
      // 2. 返回  组件，创建组件节点
      // 3. 返回  片段
      // TODO: 后续考虑动态组件
      else {
        const isKeyInsertion = Boolean(this.data[Keys.Raw][value]);

        const fn = new Function('data', `let v;with(data){v=(${value})};return v`);

        _node = this.createNode(value);
      }
    } else {
      _node = this.createNode(value);
    }
    this.tokenizer.consume();
    this.headerLine(_node);
    this.extensionLines(_node);
    if (_node.__logicType === LogicType.Component) {
      tap.once(TerpEvt.HandledComponentNode, node => (_node = node));
      tap.emit(TerpEvt.AllAttrGot);
    }
    return _node;
  }

  // TODO: 指定挂载位置
  fragmentDeclaration(renderFragment: BobeUI) {
    const fragmentNode: FragmentNode = {
      __logicType: LogicType.Fragment,
      realParent: null
    };
    renderFragment.call(this.data, this.opt, { data: this.data, root: '', anchor: '' });
    return fragmentNode;
  }

  /**
   * key 元素，组件的 key
   * value
   * 1. 静态类型值
   * 2. 插值计算 函数，可以考虑 使用 effect 或 computed 做处理
   *
   * mapKey 映射, 对应子组件的属性
   *  */
  onePropParsed(node: any, key: string, value: any, valueIsMapKey: boolean, isFn: boolean, hookI?: number) {
    if (isFn) {
      this.setProp(node, key, value, hookI);
    } else if (typeof value === 'function') {
      effect(() => {
        const res = value();
        this.setProp(node, key, res, hookI);
      });
    } else if (valueIsMapKey) {
      effect(() => {
        const res = this.data[value];
        this.setProp(node, key, res, hookI);
      });
    }
    // 静态数据
    else {
      this.setProp(node, key, value, hookI);
    }
  }

  componentDeclaration(Component: typeof Store, ctx: ProgramCtx) {
    // 先进行 attr 映射，或建立 signal 连接，才能开始 render
    // 必须等待 attr 解析完毕
    const child = Component.new();
    const prevOnePropParsed = this.onePropParsed;
    this.onePropParsed = (node, key, value, valueIsMapKey, isFn, hookI) => {
      if (isFn) {
        this.data[Keys.Raw][key] = value;
      }
      // key 映射
      else if (valueIsMapKey) {
        shareSignal(this.data, value, child, key);
      }
      // 动态值内置 computed 处理
      else if (typeof value === 'function') {
        const meta = child[Keys.Meta];
        const cells: Map<string, Signal> = meta.cells;
        const computed = $(value);
        cells.set(key, computed);
      }
      // 静态值
      else {
        child[Keys.Raw][key] = value;
      }
    };
    const afterAnchor = this.insertAfterAnchor(ctx);
    const { realParent, prevSibling } = ctx;
    tap.once(TerpEvt.AllAttrGot, () => {
      // 执行 program 时需要挂载到 parent
      const parent = realParent;
      const prev = prevSibling;
      this.onePropParsed = prevOnePropParsed;
      const componentNode = (child['ui'] as BobeUI)(this.opt, { data: child }, parent, prev);
      componentNode.realAfter = afterAnchor;
      tap.emit(TerpEvt.HandledComponentNode, componentNode);
    });
    return { __logicType: LogicType.Component };
  }
  // TODO: 优化代码逻辑，拆分 if elseif else
  condDeclaration(ctx: ProgramCtx) {
    const { prevSibling } = ctx;
    const snapbackUp = this.tokenizer.snapshot();
    const keyWord = this.tokenizer.consume();
    const noSelfCond = this.tokenizer.token.type === TokenType.NewLine;

    const [hookType, value] = this._hook({});
    const isElse = keyWord.value === 'else';
    const isIf = keyWord.value === 'if';
    const preIsCond = prevSibling?.__logicType & CondType;
    // 需要和前一个节点的 condition 合并计算
    const needCalcWithPrevIf = isElse && preIsCond;
    const ifNode: IfNode = {
      __logicType: isElse ? LogicType.Else : isIf ? LogicType.If : LogicType.Fail,
      snapshot: noSelfCond ? snapbackUp : this.tokenizer.snapshot(),
      condition: null,
      realParent: null,
      preCond: preIsCond ? prevSibling : null,
      isFirstRender: true,
      effect: null
    };
    let signal: Signal;

    // 纯 else 节点，一定要前置节点的取反
    if (noSelfCond) {
      if (isElse) {
        signal = $(() => {
          let point = ifNode.preCond;
          while (point) {
            if (point.condition.v) {
              return false;
            }
            // else 的条件判断应该停止在第一个访问到的 if 节点
            if (point.__logicType === LogicType.If) {
              break;
            }
            point = point.preCond;
          }
          return true;
        });
      }
      // default
      else {
        signal = $(() => {
          let point = ifNode.preCond;
          while (point) {
            if (point.condition.v) {
              return false;
            }
            point = point.preCond;
          }
          return true;
        });
      }
    } else {
      const valueIsMapKey = Reflect.has(this.data[Keys.Raw], value);
      // 为键映射
      if (valueIsMapKey && !needCalcWithPrevIf) {
        // 确保 signal 已生成
        runWithPulling(() => this.data[value], null);
        // 拿到 signal
        const { cells } = this.data[Keys.Meta];
        signal = cells.get(value);
      }
      // 通过前置条件 和 computed 计算出
      else {
        const fn = new Function('data', `let v;with(data){v=${value}};return v;`).bind(undefined, this.data);
        if (needCalcWithPrevIf) {
          signal = $(() => {
            let point = ifNode.preCond;
            while (point) {
              if (point.condition.v) {
                return false;
              }
              // else 的条件判断应该停止在第一个访问到的 if 节点
              if (point.__logicType === LogicType.If) {
                break;
              }
              point = point.preCond;
            }
            return fn();
          });
        } else {
          // 是 getter 使用 computed 计算出一个 signal
          signal = $(fn);
        }
      }
    }

    ifNode.condition = signal;
    // 不论是否执行 if 都应该插入 anchor 节点用于后续
    ifNode.realAfter = this.insertAfterAnchor(ctx);

    ifNode.effect = effect(
      ({ val }) => {
        // 如果值是 true 则直接放行让下面的节点自然执行插入
        if (val) {
          if (ifNode.isFirstRender) {
            if (!noSelfCond) {
              const condition = this.tokenizer.consume();
            }
            const newLine = this.tokenizer.consume();
          }
          // 更新渲染
          else {
            /**
             *  condition 在首屏对应的是 当前 token, resume 时被设置为空
             *  newLine 被用于判断起始缩进所消耗
             */
            this.tokenizer.resume(ifNode.snapshot);

            // TODO: 由于首屏渲染直接放行，导致 if 子节点首屏产生的 effect 不能被管理
            // 在 effect 中创建的子组件 sub effect 能被管理
            // 当 if = false 时，不需要执行销毁子 effect 操作
            // 因为当外部 effect 重新执行时，上次尝试的 sub effect 自动销毁
            // 前提是 sub effect 是嵌套执行的
            this.program(ifNode.realParent, ifNode.realBefore);
          }
        }
        // 删除逻辑块
        else {
          if (ifNode.isFirstRender) {
            if (noSelfCond) {
              // 让 '/n‘ 能被跳过
              this.tokenizer.i = this.tokenizer.i - 1;
              // else 时消费了一个 \n 导致 needDent 被置为 true
              this.tokenizer.needIndent = false;
            }
            const skipStr = this.tokenizer.skip();
          }
          // 更新渲染，删除所有节点
          else {
            const { realBefore, realAfter, realParent } = ifNode;
            let point = realBefore ? this.nextSib(realBefore) : this.firstChild(realParent);
            while (point !== realAfter) {
              const next = this.nextSib(point);
              this.remove(point, realParent, realBefore);
              point = next;
            }
          }
        }
        ifNode.isFirstRender = false;
      },
      [signal]
    );
    return ifNode;
  }

  /**
   * <extensionLines> ::= PIPE <attributeList> NEWLINE <extensionLines>
   *                    | ε
   */
  extensionLines(_node: any) {
    while (1) {
      //  终止条件，下一行不是 pipe
      if (!(this.tokenizer.token.type & TokenType.Pipe)) {
        return;
      }
      // 开始解析 attributeList
      const PIPE = this.tokenizer.consume();
      this.attributeList(_node);
      // 文件结束了，通常不会发生
      if (!(this.tokenizer.token.type & TokenType.NewLine)) {
        return;
      }
      // 换行
      const NEWLINE = this.tokenizer.consume();
    }
  }

  /**
   * 首行：
   * 节点名称 + 属性列表 + 换行
   * <headerLine> ::= <attributeList> NEWLINE
   */
  headerLine(_node: any) {
    this.attributeList(_node);
    const NEWLINE = this.tokenizer.consume();
  }

  /**
   * 属性列表：
   * 可以是空的，或者包含多个属性
   * <attributeList> ::= <attribute> <attributeList>
   *                    | ε
   *
   * <attribute> ::= <key> = <value>
   * 1. 普通节点 执行 setProps 🪝
   * 2. 组件节点 收集映射关系，或通过 effect 直接设值
   */
  attributeList(_node: any) {
    let key: string, eq: any;
    while (!(this.tokenizer.token.type & TokenType.NewLine)) {
      // 取 key
      if (key == null) {
        key = this.tokenizer.token.value as any;
      }
      // 取 =
      else if (eq == null) {
        eq = '=';
      }
      // 取 value
      else {
        const [hookType, value] = this._hook({});
        const rawVal = Reflect.get(this.data[Keys.Raw], value);
        const isFn = typeof rawVal === 'function';
        // 动态的要做成函数
        if (hookType === 'dynamic') {
          const valueIsMapKey = Reflect.has(this.data[Keys.Raw], value);
          const fn = isFn
            ? rawVal
            : valueIsMapKey
              ? value
              : new Function('data', `let v;with(data){v=${value}};return v;`).bind(undefined, this.data);
          this.onePropParsed(_node, key, fn, valueIsMapKey, isFn, this.hookI);
        }
        // 静态
        else if (hookType === 'static') {
          this.onePropParsed(_node, key, value, false, isFn, this.hookI);
        }
        // 基础数据字面量
        else {
          this.onePropParsed(_node, key, value, false, isFn, this.hookI);
        }
        key = null;
        eq = null;
      }
      this.tokenizer.consume();
    }
  }
  config(opt: TerpConf) {
    Object.assign(this, opt);
    this.opt = opt;
  }

  createNode(name: string) {
    return {
      name,
      props: {},
      nextSibling: null
    };
  }

  nextSib(node: any) {
    return node.nextSibling;
  }

  firstChild(node: any) {
    return node.firstChild;
  }

  _createAnchor() {
    const anchor = this.createAnchor();
    anchor[IsAnchor] = true;
    return anchor;
  }
  createAnchor() {
    return {
      name: 'anchor',
      nextSibling: null
    };
  }

  insertAfter(parent: any, node: any, prev: any) {
    return this.defaultInsert(parent, node, prev);
  }
  defaultInsert(parent: any, node: any, prev: any) {
    if (prev) {
      const next = prev.nextSibling;
      prev.nextSibling = node;
      node.nextSibling = next;
    } else {
      const next = parent.firstChild;
      parent.firstChild = node;
      node.nextSibling = next;
    }
  }

  remove(node: any, parent?: any, prev?: any) {
    return this.defaultRemove(node, parent, prev);
  }
  // TODO: 默认改成 prevItem
  defaultRemove(node: any, parent: any, prevSibling: any) {
    const next = node.nextSibling;
    if (prevSibling) {
      prevSibling.nextSibling = next;
    }
    if (parent.firstChild === node) {
      parent.firstChild = next;
    }
  }

  setProp(node: any, key: string, value: any, hookI?: number) {
    node.props[key] = value;
  }

  init(fragments: string | string[]) {
    if (typeof fragments === 'string') {
      this.tokenizer.setCode(fragments);
    } else {
      let code = '';
      for (let i = 0; i < fragments.length - 1; i++) {
        const fragment = fragments[i];
        code += fragment + `${this.HookId}${i}`;
      }
      this.tokenizer.setCode(code + fragments[fragments.length - 1]);
    }
  }
  hook: Hook;
  _hook = (props: Partial<HookProps>): [HookType | undefined, any] => {
    const value = this.tokenizer.token.value;
    const isDynamicHook = this.tokenizer.token.type & TokenType.InsertionExp;
    const isStaticHook = typeof value === 'string' && value.indexOf(this.HookId) === 0;
    const hookType: HookType = isDynamicHook ? 'dynamic' : isStaticHook ? 'static' : undefined;
    // 静态插值 `${xxx}`
    if (this.hook && isStaticHook) {
      const hookI = Number(value.slice(this.HookId.length));
      const res = this.hook({
        ...props,
        HookId: this.HookId,
        i: hookI
      });
      // TODO: 去除 this.hookI, hookI 由本函数返回
      this.hookI++;
      return [hookType, res];
    }
    // 动态插值 `{xxx}`
    else if (isDynamicHook) {
      return [hookType, value];
    }
    // 普通值
    return [hookType, value];
  };
}
