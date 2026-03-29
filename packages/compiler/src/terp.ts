import { Tokenizer } from './tokenizer';
import {
  Computed,
  deepSignal,
  Effect,
  effect,
  getPulling,
  Keys,
  runWithPulling,
  Scope,
  setPulling,
  shareSignal,
  Signal,
  SignalNode,
  Store,
  toRaw
} from 'aoye';
import {
  BobeUI,
  ComponentNode,
  CondBit,
  IfNode,
  LogicalBit,
  LogicNode,
  FakeType,
  NodeSort,
  ProgramCtx,
  StackItem,
  TerpConf,
  TokenType,
  TokenizerSwitcherBit,
  ForNode,
  ForItemNode,
  Token
} from './type';
import { jsVarRegexp } from 'bobe-shared';
import { MultiTypeStack } from './typed';

export class Interpreter {
  opt: TerpConf;
  constructor(private tokenizer: Tokenizer) {}
  isLogicNode(node: any) {
    return node && node.__logicType & LogicalBit;
  }

  ctx: ProgramCtx;
  rootComponent: ComponentNode | null = null;

  program(root: any, componentNode?: ComponentNode, before?: any, ctxProvider?: any) {
    // 首屏渲 app 组件需要创建对象
    this.rootComponent = componentNode;

    this.tokenizer.nextToken();
    const stack = new MultiTypeStack<StackItem>();
    stack.push({ node: root, prev: null }, NodeSort.Real);
    stack.push(
      { node: componentNode, prev: null },
      NodeSort.Component | NodeSort.CtxProvider | NodeSort.TokenizerSwitcher
    );
    if (ctxProvider) {
      stack.push(
        { node: ctxProvider, prev: null },
        (ctxProvider.__logicType & LogicalBit ? NodeSort.Logic : 0) | NodeSort.CtxProvider
      );
    }

    const ctx = (this.ctx = {
      realParent: root,
      prevSibling: before,
      current: null,
      stack,
      before
    });

    const rootPulling = getPulling();
    while (1) {
      // 子 tokenizer 退出，代表子组件逻辑结束
      if (this.tokenizer.isEof()) {
        if (!ctx.prevSibling) ctx.prevSibling = before;
        this.handleInsert(root, ctx.current, ctx.prevSibling, componentNode);
        break;
      }

      const token = this.tokenizer.token;
      // 下沉，创建 child0
      if (token.type & TokenType.Indent) {
        this.tokenizer.nextToken(); // token = ID
        const isLogicNode = this.isLogicNode(ctx.current);
        stack.push(
          {
            node: ctx.current,
            prev: ctx.prevSibling
          },
          !ctx.current.__logicType
            ? NodeSort.Real
            : (ctx.current.__logicType & LogicalBit ? NodeSort.Logic : 0) |
                (ctx.current.__logicType & TokenizerSwitcherBit ? NodeSort.TokenizerSwitcher : 0) |
                (ctx.current.__logicType === FakeType.Component ? NodeSort.Component : 0) |
                NodeSort.CtxProvider
        );
        if (ctx.current.__logicType) {
          // 父节点是逻辑节点
          if (isLogicNode) {
            // 保证 if 子逻辑节点能被其 effect 管理
            setPulling(ctx.current.effect);
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
        if (stack.length === 2 && !ctx.prevSibling) {
          ctx.prevSibling = before;
        }
        this.handleInsert(ctx.realParent, ctx.current, ctx.prevSibling);
      }
      // 下一个 token 是 Dedent
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.nextToken(); // token = ID | DEDENT
        const [{ node: parent, prev }, sort] = stack.pop();
        // 弹出原生节点，找最近的 ctx.realParent
        if (!parent.__logicType) {
          const prevSameType = stack.peekByType(NodeSort.Real);
          ctx.realParent = prevSameType?.node || root;
        }
        // 弹出非原生节点
        else {
          // 考虑 if, for 等获取最后一个插入节点
          if (sort & NodeSort.Logic) {
            // 找最近的 if for
            const parentLogic = stack.peekByType(NodeSort.Logic)?.node;
            if (parentLogic) {
              setPulling(parentLogic.effect);
            } else {
              setPulling(rootPulling);
            }
          }
          // 子 tokenizer 使用 Dedent 推出 component 节点后，将 tokenizer 切换为 上一个 TokenSwitcher 的 tokenizer
          if (sort & NodeSort.TokenizerSwitcher) {
            const switcher = stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
            this.tokenizer = switcher.tokenizer;
          }

          // 弹出 forItem
          if (parent.__logicType === FakeType.ForItem) {
            const { forNode } = parent as ForItemNode;
            const { i, arr, snapshot } = forNode;
            if (i + 1 < arr.length) {
              // 恢复后 token null, 下一个是 \n, Indent
              this.tokenizer.resume(snapshot);
              this.tokenizer.nextToken(); // token = \n
              this.tokenizer.nextToken(); // token = Indent
              ctx.prevSibling = parent;
              ctx.current = forNode.children[++forNode.i];
              continue;
            }
            // 正常弹出 current = for node
            ctx.prevSibling = forNode.prevSibling;
            ctx.current = forNode;
            continue;
          }
        }
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

  insertAfterAnchor(name = 'anchor') {
    const { realParent, prevSibling, stack, before } = this.ctx;
    // 先将 after 插入
    const afterAnchor = this.createAnchor(name);
    this.ctx.prevSibling = stack.length === 2 && !prevSibling ? before : prevSibling;
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
        // forItem 应该使用 forNode 的 after
        childCmp.realBefore = prev.forNode ? prev.forNode.realAfter : prev.realAfter;
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
    const [hookType, value] = this.tokenizer._hook({});
    let _node: any;
    if (value === 'if' || value === 'else' || value === 'fail') {
      return this.condDeclaration(ctx);
    } else if (value === 'for') {
      return this.forDeclaration();
    } else if (hookType) {
      const data = this.getData();
      // 静态 1. Component，2. bobe 返回的 render 方法
      if (hookType === 'static') {
        // 传组件 class 或 片段
        if (typeof value === 'function') {
          _node = this.componentOrFragmentDeclaration(value, ctx);
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
        const valueIsMapKey = Reflect.has(data[Keys.Raw], value);
        const val = data[Keys.Raw][value];
        if (typeof val === 'function') {
          _node = this.componentOrFragmentDeclaration(val, ctx);
        }
        // 字符
        else {
          const str = valueIsMapKey ? value : this.getFn(data, value);
          _node = this.createNode('text');
          this.onePropParsed(data, _node, 'text', str, valueIsMapKey, false);
        }
      }
    } else {
      _node = this.createNode(value);
    }
    this.tokenizer.nextToken(); // 跳过 node 本身，token -> id
    this.headerLine(_node);
    this.extensionLines(_node);
    // 组件用完，切换回 真实node 的方法
    if (_node.__logicType & TokenizerSwitcherBit) {
      this.onePropParsed = this.oneRealPropParsed;
      this.tokenizer = _node.tokenizer;
    }
    return _node;
  }

  forDeclaration() {
    const arrExp = this.tokenizer.nextToken().value as string;
    this.tokenizer.nextToken(); // 分号
    const itemToken = this.tokenizer.nextToken(); // item 表达式
    const isDestruct = itemToken.type === TokenType.InsertionExp;
    let itemExp: string | ((value: any) => any) = itemToken.value as string;
    if (isDestruct) {
      itemExp = '{' + itemExp + '}';
      const vars = itemExp.match(jsVarRegexp).join(',');
      itemExp = new Function('item', `let ${vars}; (${itemExp}=item); return {${vars}};`) as any;
    }
    let indexName: string, keyExp: string;
    while (this.tokenizer.code[this.tokenizer.i] !== '\n') {
      const next = this.tokenizer.nextToken();
      if (next.type !== TokenType.Semicolon) {
        if (!indexName) {
          indexName = next.value as string;
        } else {
          keyExp = next.value as string;
        }
      }
    }
    const owner = this.ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
    const prevSibling = this.ctx.prevSibling;
    const forNode: ForNode = {
      __logicType: FakeType.For,
      snapshot: this.tokenizer.snapshot(['dentStack', 'isFirstToken']),
      realParent: this.ctx.realParent,
      prevSibling,
      realBefore: prevSibling?.realAfter || prevSibling,
      realAfter: null,
      arr: null,
      itemExp,
      indexName,
      getKey: null,
      children: [],
      effect: null,
      owner,
      i: 0
    };
    if (keyExp) {
      forNode.getKey = new Function('data', `let v;with(data){v=${keyExp}};return v;`) as any;
    }
    window['for1'] = forNode;

    const data = this.getData();

    const cells = data[Keys.Meta].cells;
    const hasArrExpKey = Reflect.has(data[Keys.Raw], arrExp);
    const arrSignal = hasArrExpKey
      ? // 有 key 直接拿
        (data[arrExp], cells.get(arrExp))
      : // 无key
        new Computed(this.getFn(data, arrExp));

    // 由于此处 snapshot 多配置了2个属性，更新渲染时 应该忽略这个两个属性
    forNode.realAfter = this.insertAfterAnchor('for-after');

    // 去除 dentStack 和 isFirstToken
    const { dentStack, isFirstToken, ...snapshotForUpdate } = forNode.snapshot;

    // TODO: 更新逻辑
    let isFirstRender = true;
    // TODO: effect 重新执行时，内部的 effect 自动销毁，包括 dom setProps 无法生效了
    forNode.effect = new Effect(() => {
      let arr: any[] = (forNode.arr = arrSignal.get());
      // 订阅 iter
      arr[Keys.Iterator];
      // 使用原始数组避免 index 依赖
      arr = toRaw(arr);
      const children = forNode.children;
      // 首屏渲染
      if (isFirstRender) {
        const len = arr.length;
        for (let i = len; i--; ) {
          const nextItem = children[i + 1];
          const item = this.createForItem(forNode, i, data);
          const anchor = this.insertAfterAnchor('for-item-after');
          item.realAfter = anchor;
          if (nextItem) {
            nextItem.realBefore = anchor;
          }
          item.realParent = forNode.realParent;
          children[i] = item;
        }
        const firstInsert = children[0];
        // 有子项进行计算
        if (firstInsert) {
          firstInsert.realBefore = forNode.realBefore;
          this.tokenizer.nextToken(); // 是 NewLine
          this.tokenizer.nextToken(); // 是 Indent
        }
        // 没有子项，跳过
        else {
          this.tokenizer.skip();
        }
      }
      // 更新渲染
      else {
        const oldLen = children.length;
        const newLen = arr.length;
        const minLen = Math.min(oldLen, newLen);
        const newChildren: ForItemNode[] = [];
        if (!forNode.getKey) {
          // 删除
          if (newLen < oldLen) {
            for (let i = oldLen - 1; i >= newLen; i--) {
              const child = children[i];
              this.removeLogicNode(child);
              this.remove(child.realAfter);
              // 释放删除项 effect
              child.effect.dispose();
            }
          }
          // 新增
          if (oldLen < newLen) {
            const lastAfter = children.at(-1)?.realAfter || forNode.realBefore;
            for (let i = newLen - 1; i >= oldLen; i--) {
              const item = this.createForItem(forNode, i, data);
              newChildren[i] = item;
              const nextItem = newChildren[i + 1];
              const anchor = this.createAnchor('for-item-after');
              this.insertAfter(forNode.realParent, anchor, lastAfter);
              item.realAfter = anchor;
              if (nextItem) {
                nextItem.realBefore = anchor;
              }
              item.realParent = forNode.realParent;
              this.tokenizer = owner.tokenizer;
              /**
               * resume 后 token = null, 下个字符是 \n
               */
              this.tokenizer.resume(snapshotForUpdate);
              // 解析到缩进小于 base 时自动 eof
              this.tokenizer.useDedentAsEof = false;
              runWithPulling(() => {
                this.program(forNode.realParent, forNode.owner, lastAfter, item);
              }, item.effect);
            }
            const firstInsert = newChildren[oldLen];
            if (firstInsert) {
              firstInsert.realBefore = lastAfter;
            }
          }
          for (let i = minLen; i--; ) {
            const child = children[i];
            newChildren[i] = child;
            if (typeof itemExp === 'string') {
              child.data[itemExp] = arr[i];
            } else {
              Object.assign(child.data, itemExp(arr[i]));
            }
          }
          forNode.children = newChildren;
        }
      }
      isFirstRender = false;
    });
    return forNode.children[0] || forNode;
  }

  forItemId = 0;
  createForItem(forNode: ForNode, i: number, parentData: any) {
    let forItemNode: ForItemNode;
    /**
     * 考虑到 effect 是嵌套的，这种情况每次 forNodeEffect 更新会导致上次产生的内部 setPropsEffect 被自动释放
     * 这是响应式 effect 嵌套的默认特性
     * forNodeEffect(() => {
     *    这里通过 setPulling 模拟嵌套 effect
     *    setPropsEffect(() => {
     *    })
     * })
     * 因此我们需要让情况变成这样，内部的 effect 交由 forItemNode.effect 接管
     * 这个 scope 是全局的，即指定了参数 parentScope = null
     * 这样外部的 effect 不再自动释放 setPropsEffect
     * 这么的目的是我们能在 diff 过程中手动控制释放 forItemNode.effect
     * globalScope(() => {
     *    setPropsEffect(() => {
     *    })
     * })
     *
     * 1. runWithPulling 避免 scope 被 effect 收集
     * 2. scope 保证 signal 被 scope 管理
     */
    // TODO: scope 目前认为 parentScope 就是 其下游节点，恢复 pulling 会出现问题
    const scope = new Scope(() => {});
    scope.scope = null;
    runWithPulling(() => {
      scope.get();
    }, null);

    // 考虑到生成每项数据需要依赖原始数组，因此无法放在 scope 里
    const { arr, itemExp, indexName, getKey } = forNode;
    let data: Record<any, any>;
    if (typeof itemExp === 'string') {
      data = deepSignal(
        indexName
          ? {
              [itemExp]: arr[i],
              [indexName]: i
            }
          : {
              [itemExp]: arr[i]
            },
        getPulling()
      );
    } else {
      const rawData = itemExp(arr[i]);
      if (indexName) {
        rawData[indexName] = i;
      }
      data = deepSignal(rawData, getPulling());
    }

    Object.setPrototypeOf(data, parentData);

    forItemNode = {
      id: this.forItemId++,
      __logicType: FakeType.ForItem,
      realParent: null,
      realBefore: null,
      realAfter: null,
      forNode,
      key: getKey?.(data),
      effect: null,
      data
    };
    forItemNode.effect = scope;
    return forItemNode;
  }

  getData() {
    const { node } = this.ctx.stack.peekByType(NodeSort.CtxProvider);
    return node.data || node.owner.data;
  }

  /**
   * key 元素，组件的 key
   * value
   * 1. 静态类型值
   * 2. 插值计算 函数，可以考虑 使用 effect 或 computed 做处理
   *
   * mapKey 映射, 对应子组件的属性
   *  */
  onePropParsed(
    data: Store,
    node: any,
    key: string,
    value: any,
    valueIsMapKey: boolean,
    isFn: boolean,
    hookI?: number
  ) {
    if (isFn) {
      this.setProp(node, key, value, hookI);
    } else if (typeof value === 'function') {
      new Effect(() => {
        const res = value();
        this.setProp(node, key, res, hookI);
      });
    } else if (valueIsMapKey) {
      new Effect(() => {
        const res = data[value];
        this.setProp(node, key, res, hookI);
      });
    }
    // 静态数据
    else {
      this.setProp(node, key, value, hookI);
    }
  }

  oneRealPropParsed: Interpreter['onePropParsed'] = this.onePropParsed.bind(this);

  componentOrFragmentDeclaration(ComponentOrRender: BobeUI | typeof Store, ctx: ProgramCtx) {
    // 先进行 attr 映射，或建立 signal 连接，才能开始 render
    // 必须等待 attr 解析完毕
    let Component: typeof Store, render: BobeUI, child: any;

    const isCC = (ComponentOrRender as any).prototype instanceof Store;
    if (isCC) {
      Component = ComponentOrRender as any;
      child = Component.new();
    } else {
      render = ComponentOrRender as BobeUI;
      const boundStore = render.boundStore;
      // 使用原型链来继承 store 的数据
      child = deepSignal({}, getPulling(), true);
      Object.setPrototypeOf(child, boundStore);
    }

    const node: ComponentNode = {
      __logicType: isCC ? FakeType.Component : FakeType.Fragment,
      realParent: ctx.realParent,
      realBefore: null,
      realAfter: null,
      data: child,
      tokenizer: render ? render(true) : (child['ui'] as BobeUI)(true)
    };
    this.onePropParsed = (data, _, key, value, valueIsMapKey, isFn, hookI) => {
      if (isFn) {
        child[Keys.Raw][key] = value;
      }
      // key 映射
      else if (valueIsMapKey) {
        shareSignal(data, value, child, key);
      }
      // 动态值内置 computed 处理
      else {
        const meta = child[Keys.Meta];
        const cells: Map<string, Signal> = meta.cells;
        if (typeof value === 'function') {
          const computed = new Computed(value);
          cells.set(key, computed as any);
          child[Keys.Raw][key] = undefined;
        }
        // 静态数据
        else {
          cells.set(key, { get: () => value } as Signal);
          child[Keys.Raw][key] = value;
        }
      }
    };
    node.realAfter = this.insertAfterAnchor('component-after');
    return node;
  }
  getFn(data: any, expression: string | number) {
    return new Function('data', `let v;with(data){v=${expression}};return v;`).bind(undefined, data);
  }
  // TODO: 优化代码逻辑，拆分 if elseif else
  condDeclaration(ctx: ProgramCtx) {
    const { prevSibling } = ctx;
    const keyWord = this.tokenizer.token;
    const expToken = this.tokenizer.condExp(); // keyWord => exp
    const value = expToken.value as string | number;
    const isElse = keyWord.value === 'else';
    const isIf = keyWord.value === 'if';
    const preIsCond = prevSibling?.__logicType & CondBit;
    const data = this.getData();
    // @ts-ignore
    const noCond = value === true;
    const valueIsMapKey = !noCond && Reflect.has(data[Keys.Raw], value);
    const owner = ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
    const ifNode: IfNode = {
      __logicType: isElse ? FakeType.Else : isIf ? FakeType.If : FakeType.Fail,
      // 此时 token 是 exp, 下次解析 从 \n 开始
      snapshot: this.tokenizer.snapshot(),
      realParent: null,
      realBefore: null,
      realAfter: null,
      condition: null,
      preCond: preIsCond ? prevSibling : null,
      isFirstRender: true,
      effect: null,
      owner
    };
    let signal: SignalNode;

    switch (keyWord.value) {
      case 'if':
        if (valueIsMapKey) {
          // 确保 signal 已生成
          runWithPulling(() => data[value], null);
          // 拿到 signal
          const { cells } = data[Keys.Meta];
          signal = cells.get(value);
        } else {
          const fn = this.getFn(data, value);
          // 是 getter 使用 computed 计算出一个 signal
          signal = new Computed(fn);
        }
        break;
      case 'else':
        // 纯 else
        if (noCond) {
          signal = new Computed(() => {
            let point = ifNode.preCond;
            while (point) {
              if (point.condition.get()) {
                return false;
              }
              // else 的条件判断应该停止在第一个访问到的 if 节点
              if (point.__logicType === FakeType.If) {
                break;
              }
              point = point.preCond;
            }
            return true;
          });
        }
        // else if xxx
        else {
          const fn = valueIsMapKey ? null : this.getFn(data, value);
          signal = new Computed(() => {
            let point = ifNode.preCond;
            while (point) {
              if (point.condition.get()) {
                return false;
              }
              // else 的条件判断应该停止在第一个访问到的 if 节点
              if (point.__logicType === FakeType.If) {
                break;
              }
              point = point.preCond;
            }
            return valueIsMapKey ? data[value] : fn();
          });
        }
        break;
      case 'fail':
        signal = new Computed(() => {
          let point = ifNode.preCond;
          while (point) {
            if (point.condition.get()) {
              return false;
            }
            point = point.preCond;
          }
          return true;
        });
        break;
      default:
        break;
    }

    ifNode.condition = signal;
    // 不论是否执行 if 都应该插入 anchor 节点用于后续
    ifNode.realAfter = this.insertAfterAnchor(`${keyWord.value}-after`);

    const ef = effect(
      ({ val }) => {
        // 如果值是 true 则直接放行让下面的节点自然执行插入
        if (val) {
          if (ifNode.isFirstRender) {
            this.tokenizer.nextToken(); // token = NEWLINE
            this.tokenizer.nextToken(); // token = ID
          }
          // 更新渲染
          else {
            // 切换到对应 Switcher 的 tokenizer
            this.tokenizer = ifNode.owner.tokenizer;
            /**
             * resume 后 token = null, 下个字符是 \n
             */
            this.tokenizer.resume(ifNode.snapshot);
            this.tokenizer.useDedentAsEof = false;

            // 由于首屏渲染直接放行，导致 if 子节点首屏产生的 effect 不能被管理
            // 在 effect 中创建的子组件 sub effect 能被管理
            // 当 if = false 时，不需要执行销毁子 effect 操作
            // 因为当外部 effect 重新执行时，上次尝试的 sub effect 自动销毁
            // 前提是 sub effect 是嵌套执行的
            this.program(ifNode.realParent, ifNode.owner, ifNode.realBefore, ifNode);
          }
        }
        // 删除逻辑块
        else {
          if (ifNode.isFirstRender) {
            // 此时 token 是 condition， i => \n
            this.tokenizer.skip(); // skipStr
          }
          // 更新渲染，删除所有节点
          else {
            this.removeLogicNode(ifNode);
          }
        }
        ifNode.isFirstRender = false;
      },
      [signal]
    );
    ifNode.effect = ef;
    return ifNode;
  }

  removeLogicNode(node: LogicNode) {
    const { realBefore, realAfter, realParent } = node;
    let point = realBefore ? this.nextSib(realBefore) : this.firstChild(realParent);
    while (point !== realAfter) {
      const next = this.nextSib(point);
      this.remove(point, realParent, realBefore);
      point = next;
    }
  }
  /**
   * <extensionLines> ::= PIPE <attributeList> NEWLINE <extensionLines>
   *                    | ε
   */
  extensionLines(_node: any) {
    while (1) {
      //  终止条件，下一行不是 pipe
      if ((this.tokenizer.token.type & TokenType.Pipe) === 0) {
        return;
      }
      // 开始解析 attributeList
      this.tokenizer.nextToken(); // PIPE
      this.attributeList(_node);
      // 文件结束了，通常不会发生
      if ((this.tokenizer.token.type & TokenType.NewLine) === 0) {
        return;
      }
      // 换行
      this.tokenizer.nextToken(); // NEWLINE
    }
  }

  /**
   * 首行：
   * 节点名称 + 属性列表 + 换行
   * <headerLine> ::= <attributeList> NEWLINE
   */
  headerLine(_node: any) {
    this.attributeList(_node);
    this.tokenizer.nextToken(); // NEWLINE
  }

  /**
   * 属性列表：
   * 可以是空的，或者包含多个属性
   * <attributeList> ::= <attribute> <attributeList>
   *                    | ε
   *
   * <attribute> ::= <key> = <value>
   * 1. 普通节点 执行 setProps 🪝
   * 2. 组件节点 收集映射关系，或 产生 computed
   */
  attributeList(_node: any) {
    let key: string, eq: any;
    const data = this.getData();
    while ((this.tokenizer.token.type & TokenType.NewLine) === 0) {
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
        const [hookType, value, hookI] = this.tokenizer._hook({});
        const rawVal = data[Keys.Raw][value];
        const isFn = typeof rawVal === 'function';
        // 动态的要做成函数
        if (hookType === 'dynamic') {
          const valueIsMapKey = Reflect.has(data[Keys.Raw], value);
          const fn = isFn ? rawVal : valueIsMapKey ? value : this.getFn(data, value);
          this.onePropParsed(data, _node, key, fn, valueIsMapKey, isFn, hookI);
        }
        // 静态
        else if (hookType === 'static') {
          this.onePropParsed(data, _node, key, value, false, isFn, hookI);
        }
        // 基础数据字面量
        else {
          this.onePropParsed(data, _node, key, value, false, isFn, hookI);
        }
        key = null;
        eq = null;
      }
      this.tokenizer.nextToken();
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

  createAnchor(name: string) {
    return {
      name,
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
}
