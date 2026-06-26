import { Tokenizer } from './tokenizer';
import {
  backupSignal,
  Computed,
  deepSignal,
  Effect,
  effect,
  getProxyHasKey,
  getPulling,
  isStore,
  Keys,
  noopEffect,
  NoopEffect,
  runWithPulling,
  ScheduleType,
  Scope,
  setPulling,
  shareSignal,
  Signal,
  SignalNode,
  Store,
  toRaw
} from 'aoye';
import {
  UI,
  ComponentNode,
  CondBit,
  IfNode,
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
  ContextNode,
  ContextBit,
  DynamicNode,
  CtxProviderBit,
  FakeNode,
  TpNode,
  ChildrenSugarType
} from './type';
import { date32, hasOwn, jsVarRegexp, pick, pickInPlace } from 'bobe-shared';
import { MultiTypeStack } from './typed';
import { InlineFragment, isRenderAble, isUI, macInc, safe, safeExclude } from './util';
import { KEY_INDEX, setCtxStack } from './global';

export class Interpreter {
  opt: TerpConf;
  constructor(private tokenizer: Tokenizer) {}

  ctx: ProgramCtx;
  rootComponent: ComponentNode | null = null;
  root: any;

  program(root: any, componentNode?: ComponentNode, before?: any, ctxProvider?: any) {
    // 首屏渲 app 组件需要创建对象
    this.rootComponent = componentNode;
    // 给外部 hook 获取 root 节点
    this.root = root;
    this.tokenizer.nextToken();
    const stack = new MultiTypeStack<StackItem>();
    setCtxStack(stack);
    stack.push({ node: root, prev: null }, NodeSort.Real);
    stack.push(
      { node: componentNode, prev: null },
      NodeSort.Component | NodeSort.CtxProvider | NodeSort.TokenizerSwitcher
    );
    if (ctxProvider) {
      stack.push(
        { node: ctxProvider, prev: null },
        (ctxProvider.__logicType && ctxProvider.effect ? NodeSort.EffectNode : 0) | NodeSort.CtxProvider
      );
    }
    const rootLen = stack.length;

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
        if (ctx.current) {
          ctx.current.__logicType ? this.leaveLogicNode?.(ctx.current, false) : this.leaveNode?.(ctx.current, false);
        }
        break;
      }

      const token = this.tokenizer.token;
      // 下沉，创建 child0
      if (token.type & TokenType.Indent) {
        this.tokenizer.nextToken(); // token = ID
        const isEffectNode = ctx.current && ctx.current.__logicType && ctx.current.effect;
        stack.push(
          {
            node: ctx.current,
            prev: ctx.prevSibling
          },
          !ctx.current.__logicType
            ? NodeSort.Real
            : (isEffectNode ? NodeSort.EffectNode : 0) |
                (ctx.current.__logicType & TokenizerSwitcherBit ? NodeSort.TokenizerSwitcher : 0) |
                (ctx.current.__logicType & ContextBit ? NodeSort.Context : 0) |
                (ctx.current.__logicType === FakeType.Component ? NodeSort.Component : 0) |
                (ctx.current.__logicType === FakeType.Tp ? NodeSort.Real : 0) |
                // context 节点， 不提供 data 上下文，其余 Fake 节点提供 CtxProvider
                (ctx.current.__logicType & CtxProviderBit ? NodeSort.CtxProvider : 0)
        );
        if (ctx.current.__logicType) {
          this.beforeLogicIndent?.(ctx.current);
          // 父节点是带 effect 的 Fake 节点
          if (isEffectNode) {
            // 保证 if 子逻辑节点能被其 effect 管理
            setPulling(ctx.current.effect);
            if (ctx.current.__logicType & FakeType.ForItem) {
              ctx.prevSibling = ctx.current.realBefore;
            }
            if (ctx.current.__logicType & FakeType.Tp) {
              runWithPulling(() => {
                ctx.realParent = ctx.current.tpData.node;
              }, null);
              ctx.prevSibling = ctx.current.contentBefore;
            }
          }
        }
        // 父节点是原生节点时才修改 ctx.prevSibling
        else {
          if (ctx.current) {
            if (this.beforeIndent?.(ctx.current) === false) {
              const dentLen = this.tokenizer.dentStack[this.tokenizer.dentStack.length - 1];
              this.tokenizer.skip(dentLen);
              ctx.current = null;
              continue;
            }
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
        if (stack.length === rootLen && !ctx.prevSibling) {
          ctx.prevSibling = before;
        }
        this.handleInsert(ctx.realParent, ctx.current, ctx.prevSibling);
        ctx.current.__logicType ? this.leaveLogicNode?.(ctx.current, false) : this.leaveNode?.(ctx.current, false);
      }
      // 下一个 token 是 Dedent
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.nextToken(); // token = ID | DEDENT
        const [{ node: parent, prev }, sort] = stack.pop();
        // 弹出原生节点，找最近的 ctx.realParent / tp 节点
        if (!parent.__logicType) {
          const prevSameType = stack.peekByType(NodeSort.Real);
          const sameNode = prevSameType?.node;
          if (sameNode) {
            ctx.realParent =
              sameNode.__logicType === FakeType.Tp
                ? runWithPulling(() => (sameNode as TpNode).tpData.node, null)
                : sameNode;
          } else {
            ctx.realParent = root;
          }
        }
        // 弹出非原生节点
        else {
          // 考虑 if, for 等获取最后一个插入节点
          if (sort & NodeSort.EffectNode) {
            // 找最近的 if for
            const parentLogic = stack.peekByType(NodeSort.EffectNode)?.node;
            if (parentLogic) {
              setPulling(parentLogic.effect);
            } else {
              setPulling(rootPulling);
            }
          }

          if (parent.__logicType === FakeType.Tp) {
            ctx.realParent = parent.realParent;
          }

          // 子 tokenizer 使用 Dedent 推出 component 节点后，将 tokenizer 切换为 上一个 TokenSwitcher 的 tokenizer
          if (sort & NodeSort.TokenizerSwitcher) {
            const switcher = stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
            if (parent.resumeSnapshot) {
              this.tokenizer.resume(parent.resumeSnapshot);
            }
            this.tokenizer = switcher.tokenizer;
          }

          // 弹出 forItem
          if (parent.__logicType === FakeType.ForItem) {
            const { forNode } = parent as ForItemNode;
            const { i, arr, snapshot } = forNode;
            // 每个 for-item 不会走 handleInsert
            this.leaveLogicNode?.(parent, false);
            if (i + 1 < arr.length) {
              // 恢复后 token null, 下一个是 \n, Indent
              this.tokenizer.resume(snapshot);
              this.tokenizer.nextToken(); // token = \n
              this.tokenizer.nextToken(); // token = Indent
              ctx.current = forNode.children[++forNode.i];
              ctx.prevSibling = ctx.current.realBefore;
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

  insertAnchor(node: any, name = 'anchor', isBefore = false) {
    const { realParent, prevSibling, stack, before, current } = this.ctx;
    // 先将 after 插入
    const afterAnchor = this.createAnchor(name, isBefore);
    if (!isBefore) {
      this.anchorRefBack(afterAnchor, node);
    }
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
   * <declaration> ::= <tagName=token> <headerLineAndExtensions>
   *  */
  declaration(ctx: ProgramCtx) {
    const [hookType, value] = this.tokenizer._hook({});
    let _node: any;
    if (value === 'if' || value === 'else' || value === 'fail') {
      return this.condDeclaration(ctx);
    } else if (value === 'context') {
      _node = this.createContextNode(ctx);
    } else if (value === 'tp') {
      return this.createTpNode(ctx);
    } else if (value === 'for') {
      return this.forDeclaration(ctx);
    } else if (hookType) {
      const data = this.getData();
      // 静态 1. Component，2. bobe 返回的 render 方法
      if (hookType === 'static') {
        // 传组件 class 或 片段
        if (isRenderAble(value)) {
          _node = this.componentOrFragmentDeclaration(value, ctx);
        }
        // 其余类型不允许静态插值
        else {
          _node = this.createNode('text');
          this.setProp(_node, 'children', String(value));
          // throw new SyntaxError(`declaration 不支持 ${value} 类型的静态插值`);
        }
      }
      // 动态插值
      // 一定是 js 表达式
      // 1. 返回基础值，创建文本节点 createNode('text', String(value))，prop key 为 'children'
      // 2. 返回  组件，创建组件节点
      // 3. 返回  片段
      // TODO: 后续考虑动态组件
      else {
        return this.dynamicDeclaration(data, value, ctx);
        // const val = data[Keys.Raw][value];
        // if (isRenderAble(val)) {
        //   _node = this.componentOrFragmentDeclaration(val, ctx);
        // }
        // // 字符
        // else {
        //   _node = this.createNode('text');
        //   const str = valueIsMapKey ? value : this.getFn(data, value);
        //   this.onePropParsed(data, _node, 'children', str, valueIsMapKey, false);
        // }
      }
    } else if (this.tokenizer.token.type === TokenType.String) {
      _node = this.createNode('text');
      this.setProp(_node, 'children', String(value));
    } else {
      _node = this.createNode(value);
    }
    this.tokenizer.nextToken(); // 跳过 node 本身，token -> id
    this.skipComponentTypeArguments(_node);
    this.headerLineAndExtensions(_node);
    // 组件用完，切换回 真实node 的方法
    this.onePropParsed = this.oneRealPropParsed;
    if (_node.__logicType & TokenizerSwitcherBit) {
      this.tokenizer = _node.tokenizer;
      // 切换到子 tokenizer 时如有快照，则指定
      if (_node.fragmentSnapshot) {
        // TODO: 考虑使用 dent 处理时，的初始化 indent。这个行为应与 Tokenizer constructor 中逻辑一致
        this.tokenizer.resume(_node.fragmentSnapshot);
        this.tokenizer.useDedentAsEof = true;
        this.tokenizer.initIndentWhenUseDedentAsEof();
      }
    }
    return _node;
  }

  dynamicDeclaration(pData: any, value: string, ctx: ProgramCtx) {
    const valueIsMapKey = Boolean(getProxyHasKey(pData, value));
    let node: DynamicNode = {
      __logicType: null,
      realParent: ctx.realParent,
      tokenizer: null,
      effect: null,
      textNode: null,
      owner: ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node,
      snapshot: this.tokenizer.snapshot(['dentStack', 'isFirstToken']),
      parentDataProvider: ctx.stack.peekByType(NodeSort.CtxProvider)?.node
    };
    let isUpdate = false;
    // 不论是否执行 if 都应该插入 anchor 节点用于后续
    node.realAfter = this.insertAnchor(node, `dynamic-after`);
    node.effect = this.effect(
      ({ old, val }) => {
        let { __logicType: oldLogicType, textNode: oldTextNode } = node;
        // 删除组件旧 dom
        if (oldLogicType) {
          this.removeLogicNode(node as LogicNode);
          pickInPlace(node, ['realParent', 'realBefore', 'realAfter', 'owner', 'snapshot', 'parentDataProvider']);
        }

        let logicType: FakeType | undefined;
        if (isRenderAble(val)) {
          // text -> component
          if (oldTextNode) {
            this.remove(oldTextNode);
          }
          const info = this.createComponentData(val);
          logicType = info.__logicType;
          Object.assign(node, info);
          /*----------------- 参考主 Declaration -----------------*/
          this.onePropParsed = info.onePropParsed;
          // 更新时切换 owner 的 tokenizer 来获取数据
          if (isUpdate) {
            this.tokenizer = node.owner.tokenizer;
            this.tokenizer.resume(node.snapshot);
            this.ctx.stack.push({ node: node.parentDataProvider, prev: null }, NodeSort.CtxProvider);
          }
          this.tokenizer.nextToken(); // 跳过 node 本身，token -> id
          this.skipComponentTypeArguments(node);
          this.headerLineAndExtensions(node);
          if (isUpdate) {
            this.ctx.stack.pop();
          }
          // 组件用完，切换回 真实node 的方法
          this.onePropParsed = this.oneRealPropParsed;
          this.tokenizer = node.tokenizer;
          // 切换到子 tokenizer 时如有快照，则指定
          if (node.fragmentSnapshot) {
            // TODO: 考虑使用 dent 处理时，的初始化 indent。这个行为应与 Tokenizer constructor 中逻辑一致
            this.tokenizer.resume(node.fragmentSnapshot);
          }
          if (isUpdate) {
            this.tokenizer.useDedentAsEof = false;
            this.program(node.realParent, node as any, node.realBefore);
          }
          // 首屏采用 useDedentAsEof
          else {
            this.tokenizer.useDedentAsEof = true;
            this.tokenizer.initIndentWhenUseDedentAsEof();
          }
        } else {
          node.__logicType = FakeType.DynamicText;
          // component/text/undefined -> text
          let textNode = oldTextNode;
          const isNewTextNode = !textNode;
          if (isNewTextNode) {
            textNode = node.textNode = this.createNode('text');
          }
          this.setProp(textNode, 'children', String(val));
          // this.onePropParsed(pData, textNode, 'children', String(val), valueIsMapKey, false);
          if (isNewTextNode) {
            if (isUpdate) {
              this.handleInsert(node.realParent, textNode, node.realBefore);
            } else {
              this.tokenizer.nextToken();
              this.skipComponentTypeArguments(node, true);
              this.headerLineAndExtensions(node);
              const { realParent, prevSibling } = this.ctx;
              this.handleInsert(realParent, textNode, prevSibling);
            }
            this.leaveNode?.(textNode, false);
          }
        }

        isUpdate = true;
        return (isDestroy: boolean) => {
          if (isDestroy) {
            this.removeLogicNode(node as LogicNode);
          }
        };
      },
      [valueIsMapKey ? () => pData[value] : this.getFn(pData, value)],
      { type: 'render' }
    );
    return node;
  }

  createTpNode(ctx: ProgramCtx) {
    const child = deepSignal({}, getPulling());
    const node: TpNode = {
      __logicType: FakeType.Tp,
      data: this.getData(),
      realParent: ctx.realParent,
      realBefore: null,
      realAfter: null,
      contentBefore: null,
      contentAfter: null,
      effect: null,
      snapshot: null,
      tpData: child,
      owner: ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node
    };

    this.onePropParsed = createStoreOnePropParsed(child);
    this.tokenizer.nextToken(); // 跳过 node 本身，token -> id
    // 内部会完成 snapshot
    this.headerLineAndExtensions(node);
    // 组件用完，切换回 真实node 的方法
    this.onePropParsed = this.oneRealPropParsed;
    node.realAfter = this.insertAnchor(node, 'tp-after');
    // 这两个是不需要 anchorRefBack，它们是用于控制内容移动的。tp 本身位置由 tp-after 控制
    const before = (node.contentBefore = this.createAnchor('tp-content-before', true));
    const after = (node.contentAfter = this.createAnchor('tp-content-after', true));
    let firstRender = true;
    // 创建 Scope 管理子 effect 生命周期（参照 forItem），
    // 使 tp 移动目标 DOM 时子 effect 不被销毁
    let scope = new Scope(() => {});
    scope.scope = null;
    runWithPulling(() => {
      scope.get();
    }, null);
    node.effect = scope;
    this.effect(
      ({ old: oldDom, val: dom }) => {
        const removeTpChild = () => {
          // 删除
          if (oldDom) {
            let point = before;
            do {
              const next = this.nextSib(point);
              this.remove(point, oldDom, null);
              if (point === after) break;
              point = next;
            } while (true);
          }
        };
        /**
         * TODO: 在 SSR 渲染时字符串的拼接靠的是 节点创建 与 插入的时机来确定
         * 但是 tp 节点可能将后创建的节点插入到已创建的节点中，导致字符串拼接出现问题
         * 目前 SSR 只能让 tp 在首屏时不做插入，等到 hydrate 后通过更新渲染进行插入
         */
        // 首屏让 program 自动往下解析，或者 skip
        if (firstRender) {
          // 有 dom 节点时，tp 在 program 中会将 dom 设置为 realParent 然后开始解析子树，这里不需要做任何处理
          if (dom) {
            this.handleInsert(dom, after, null);
            this.handleInsert(dom, before, null);
          }
          // 无 dom 节点跳过，在
          else {
            // 如果有缩进则跳过缩进内部的内容
            if (this.tokenizer.token.type === TokenType.Indent) {
              // 如果是 indent 此时缩进比 tp 更进一格，所以要找 -2 位置的缩进为 tp 的缩进
              const dentLen = this.tokenizer.dentStack[this.tokenizer.dentStack.length - 2] ?? 0;
              this.tokenizer.skip(dentLen);
            }
          }
        } else {
          if (dom) {
            // 移动
            if (oldDom) {
              let point = before,
                lastInsert = null;
              do {
                const next = this.nextSib(point);
                // 修改直接子逻辑节点的 realParent
                const fakeNode = point[FakeNode];
                if (fakeNode) {
                  fakeNode.realParent = dom;
                }
                this.handleInsert(dom, point, lastInsert);
                if (point === after) break;
                lastInsert = point;
                point = next;
              } while (true);
            }
            // 新增 参照 condDeclaration
            else {
              this.handleInsert(dom, after, null);
              this.handleInsert(dom, before, null);
              runWithPulling(() => {
                this.tokenizer = node.owner.tokenizer;
                this.tokenizer.resume(node.snapshot);
                this.tokenizer.useDedentAsEof = false;
                this.program(dom, node.owner, before, node);
              }, scope);
            }
          } else {
            // 删除
            removeTpChild();
            scope.dispose();
            scope = new Scope(() => {});
            scope.scope = null;
            runWithPulling(() => { scope.get(); }, null);
            node.effect = scope;
          }
        }
        firstRender = false;
        return (isDestroy: boolean) => {
          if (isDestroy) {
            removeTpChild();
            scope.dispose();
          }
        };
      },
      [() => child.node],
      { type: 'render' }
    );

    return node;
  }
  createContextNode(ctx: ProgramCtx) {
    const child = deepSignal({}, getPulling());
    const parentContext: any = ctx.stack.peekByType(NodeSort.Context)?.node?.context;
    if (parentContext) {
      backupSignal(child, parentContext);
    }

    this.onePropParsed = createStoreOnePropParsed(child);

    const node: ContextNode = {
      __logicType: FakeType.Context,
      context: child,
      realParent: ctx.realParent,
      realBefore: null,
      realAfter: null
    };
    node.realAfter = this.insertAnchor(node, 'context-after');
    return node;
  }

  formatForCollection(collection: any) {
    // 不调 toRaw：让 proxy 的 forEach 负责 trackIterator + deepSignal 包装 item
    const res = {
      arr: [] as any[],
      keys: null as string[] | null
    };

    // 数组
    if (Array.isArray(collection)) {
      res.arr = collection;
      return res;
    }

    // Map
    if (collection instanceof Map) {
      res.keys = [];
      collection.forEach((v, k) => {
        res.arr.push(v);
        res.keys.push(k);
      });
      return res;
    }

    // 集合
    if (typeof collection === 'object' && collection !== null) {
      if (collection[Symbol.iterator]) {
        res.arr = Array.from(collection);
        return res;
      }

      res.arr = Object.values(collection);
      res.keys = Object.keys(collection);
      return res;
    }

    if (typeof collection === 'number') {
      res.arr = Array.from({ length: collection });
      return res;
    }

    if (typeof collection === 'string') {
      res.arr = collection.split('');
      return res;
    }

    return res;
  }
  forDeclaration(ctx: ProgramCtx) {
    const arrExp = this.tokenizer.jsExp().value as string;
    this.tokenizer.nextToken(); // 分号
    const itemToken = this.tokenizer.nextToken(); // item 表达式
    const isDestruct = itemToken.type === TokenType.InsertionExp;
    let itemExp: string | ((value: any) => any) = itemToken.value as string,
      vars: string[];
    if (isDestruct) {
      itemExp = '{' + itemExp + '}';
      vars = itemExp.match(jsVarRegexp);
      const varStr = vars.join(',');
      itemExp = new Function(itemExp, `return {${varStr}};`) as any;
    }
    let indexName: string,
      keyExp: string,
      char = this.tokenizer.peekChar();
    if (char === ';') {
      this.tokenizer.nextToken(); // 分号
      if (this.tokenizer.peekChar() !== '\n') keyExp = this.tokenizer.jsExp().value as string;
    } else if (char === '\n') {
    }
    // 下一个是 indexName
    else {
      indexName = this.tokenizer.nextToken().value as string;
      if (this.tokenizer.peekChar() === ';') {
        this.tokenizer.nextToken(); // 分号
        if (this.tokenizer.peekChar() !== '\n') keyExp = this.tokenizer.jsExp().value as string;
      }
    }

    const owner = ctx.stack.peekByType(NodeSort.TokenizerSwitcher)?.node;
    const prevSibling = ctx.prevSibling;
    const forNode: ForNode = {
      __logicType: FakeType.For,
      snapshot: this.tokenizer.snapshot(['dentStack', 'isFirstToken']),
      realParent: ctx.realParent,
      prevSibling,
      realBefore: prevSibling?.realAfter || prevSibling,
      realAfter: null,
      arr: null,
      reactiveArr: null,
      keys: null,
      arrSignal: null,
      itemExp,
      indexName,
      getKey: null,
      children: [],
      effect: null,
      owner,
      vars,
      i: 0
    };
    if (keyExp) {
      const rawGetKey = new Function('data', `with(data){return (${keyExp})}`) as any;
      forNode.getKey = (data: any) => rawGetKey(safe(data));
    }

    const data = this.getData();

    const cells = data[Keys.Meta].cells;
    const hasArrExpKey = Reflect.has(data[Keys.Raw], arrExp);
    const arrSignal = hasArrExpKey
      ? // 有 key 直接拿
        (data[arrExp], cells.get(arrExp))
      : // 无key
        new Computed(this.getFn(data, arrExp));
    forNode.arrSignal = arrSignal;
    // 由于此处 snapshot 多配置了2个属性，更新渲染时 应该忽略这个两个属性
    forNode.realAfter = this.insertAnchor(forNode, 'for-after');

    // 去除 dentStack 和 isFirstToken
    const { dentStack, isFirstToken, ...snapshotForUpdate } = forNode.snapshot;

    let isFirstRender = true;
    forNode.effect = new this.Effect(() => {
      const collection = arrSignal.get();
      const { arr: formattedArr, keys } = this.formatForCollection(collection);
      let arr: any = formattedArr;
      // 订阅 Iterator：数组/Map/Set 的结构变更
      arr[Keys.Iterator];
      const prevCtx = getPulling();
      setPulling(null);
      // reactiveArr：数组为 proxy 支持 index 级响应式，Map/Set item 已被 deepSignal 包装
      forNode.reactiveArr = formattedArr;
      // arr（diff 用）：数组用 toRaw 避免 index 级依赖，Map/Set 本就是普通数组
      forNode.arr = Array.isArray(collection) ? toRaw(arr) : arr;
      forNode.keys = keys;
      const children = forNode.children;
      // 首屏渲染
      if (isFirstRender) {
        const len = arr.length;
        for (let i = len; i--; ) {
          const item = this.createForItem(forNode, i, data);
          item.realAfter = this.insertAnchor(item, 'for-item-after');
          item.realBefore = this.insertAnchor(item, 'for-item-before', true);
          item.realParent = forNode.realParent;
          children[i] = item;
        }
        const firstInsert = children[0];
        // 有子项进行计算
        if (firstInsert) {
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
              this.removeForItem(children, i);
            }
          }
          // 新增
          if (oldLen < newLen) {
            const lastAfter = children.at(-1)?.realAfter || forNode.realBefore;
            for (let i = newLen - 1; i >= oldLen; i--) {
              this.insertForItem(forNode, i, data, newChildren, lastAfter, snapshotForUpdate);
            }
          }
          for (let i = minLen; i--; ) {
            const child = children[i];
            newChildren[i] = child;
            this.reuseForItem(child, arr[i], itemExp, i, indexName, keys?.[i]);
          }
        }
        // 带 key 列表
        else {
          let s = 0,
            e1 = oldLen - 1,
            e2 = newLen - 1;
          // 掐头
          while (s <= e1 && s <= e2) {
            const child = children[s];
            const old = child.key;
            const itemData = this.getItemData(forNode, s, data);
            const key = forNode.getKey(itemData);
            if (old === key) {
              newChildren[s] = child;
              this.reuseForItem(child, arr[s], itemExp, s, indexName, keys?.[s]);
              s++;
            } else {
              break;
            }
          }
          // 去尾
          while (s <= e1 && s <= e2) {
            const child = children[e1];
            const old = child.key;
            const itemData = this.getItemData(forNode, e2, data);
            const key = forNode.getKey(itemData);
            if (old === key) {
              newChildren[e2] = child;
              this.reuseForItem(child, arr[e2], itemExp, e2, indexName, keys?.[e2]);
              e1--;
              e2--;
            } else {
              break;
            }
          }
          // 纯新增
          if (s > e1) {
            if (s <= e2) {
              // s > 0 纯尾增
              // 否则 纯尾增
              const firstBefore = s > 0 ? children[s - 1]?.realAfter || forNode.realBefore : forNode.realBefore;
              for (let i = e2; i >= s; i--) {
                this.insertForItem(forNode, i, data, newChildren, firstBefore, snapshotForUpdate);
              }
            }
          }
          // 纯尾删
          else if (s > e2) {
            if (s <= e1) {
              for (let i = e1; i >= s; i--) {
                this.removeForItem(children, i);
              }
            }
          }
          // 混合
          else {
            let s1 = s,
              s2 = s;
            const mixLen = e2 - s2 + 1;
            /** key -> 旧 index */
            const key2new = new Map<any, number>();
            for (let i = s2; i <= e2; i++) {
              // TODO: 这里只求 key 可以不用响应式
              const itemData = this.getItemData(forNode, i, data);
              const key = forNode.getKey(itemData);
              key2new.set(key, i);
            }
            /*----------------- 构建 new2oldI -----------------*/
            let maxIncNewI = -1;
            let hasMove = false;
            const new2oldI = new Array<number>(mixLen).fill(-1);
            for (let i = s1; i <= e1; i++) {
              const key = children[i].key;
              const newI = key2new.get(key);
              // 不在新列表中，删除
              if (newI == null) {
                this.removeForItem(children, i);
                continue;
              }
              const child = children[i];
              // 复用
              newChildren[newI] = child;
              this.reuseForItem(child, arr[newI], itemExp, newI, indexName, keys?.[newI]);
              new2oldI[newI - s2] = i;
              // 剩余的 key 是新增
              key2new.delete(key);
              // 如果 newI 比已处理的最大 newI 要小，说明索引较小的项反而靠后，即发生移动
              if (newI < maxIncNewI) {
                hasMove = true;
              } else {
                maxIncNewI = newI;
              }
            }
            /*----------------- 纯增删 -----------------*/
            if (!hasMove) {
              // 按顺序从前往后插入即可
              key2new.forEach((i, key) => {
                const before = i === 0 ? forNode.realBefore : newChildren[i - 1].realAfter;
                this.insertForItem(forNode, i, data, newChildren, before, snapshotForUpdate);
              });
            } else {
              /*----------------- 增删移 -----------------*/
              const incI = macInc(new2oldI),
                incLen = incI.length;
              /** p1 表示新数组中的索引 */
              let p1: number,
                /** p2 表示最长递增子序列的索引 */
                p2: number;
              // 从 s2 开始对比
              for (p1 = s2, p2 = 0; p1 <= e2; p1++) {
                const oldI = new2oldI[p1];
                /** 新增 */
                if (oldI === -1) {
                  const before = p1 === 0 ? forNode.realBefore : newChildren[p1 - 1].realAfter;
                  this.insertForItem(forNode, p1, data, newChildren, before, snapshotForUpdate);
                  continue;
                }

                /** 锚点在 new2oldI 组中的索引 */
                const staticIdx = incI[p2] + s2;
                // 匹配到锚点，复用节点，已在构建 new2oldI 时完成
                if (p1 === staticIdx) {
                  p2 <= incLen && p2++;
                  continue;
                }

                // p1 点位需要移动, 数据复用在 new2oldI 构建时已完成，这里处理 dom 移动即可
                let before = p1 === 0 ? forNode.realBefore : newChildren[p1 - 1].realAfter;
                const child = newChildren[p1];

                const { realBefore, realAfter, realParent } = child;

                let point = realBefore,
                  next: any;
                do {
                  next = this.nextSib(point);
                  this.insertAfter(realParent, point, before);
                  // this.handleInsert(realParent, point, before);
                  before = point;
                  if (point === realAfter) break;
                  point = next;
                } while (true);
              }
            }
          }
        }
        forNode.children = newChildren;
      }
      isFirstRender = false;
      setPulling(prevCtx);

      return isDestroy => {
        if (isDestroy) {
          for (let i = 0; i < forNode.children.length; i++) {
            const item = forNode.children[i];
            item.effect.dispose();
          }
        }
      };
    }, ScheduleType.Render);
    return forNode.children[0] || forNode;
  }

  /** after 锚点，对 fake 节点反引用
   * 用于 tp 节点 移动时，可以通过 after 锚点找到 fake 节点并做 realParent 的修正
   */
  anchorRefBack(anchor: any, node: LogicNode) {
    anchor[FakeNode] = node;
  }

  insertForItem(
    forNode: ForNode,
    i: number,
    parentData: any,
    newChildren: ForItemNode[],
    before: any,
    snapshotForUpdate: any
  ) {
    const item = this.createForItem(forNode, i, parentData);
    newChildren[i] = item;
    let realAfter = this.createAnchor('for-item-after');
    this.anchorRefBack(realAfter, item);
    this.handleInsert(forNode.realParent, realAfter, before);

    let realBefore = this.createAnchor('for-item-before', true);
    this.handleInsert(forNode.realParent, realBefore, before);

    item.realBefore = realBefore;
    item.realAfter = realAfter;

    this.tokenizer = forNode.owner.tokenizer;
    /**
     * resume 后 token = null, 下个字符是 \n
     */
    // 解析到缩进小于 base 时自动 eof
    this.tokenizer.resume(snapshotForUpdate);
    this.tokenizer.useDedentAsEof = false;
    runWithPulling(() => {
      this.program(forNode.realParent, forNode.owner, realBefore, item);
    }, item.effect);
  }

  removeForItem(children: ForItemNode[], i: number) {
    const child = children[i];
    const after = child.realAfter!;
    this.removeLogicNode(child);
    this.remove(child.realBefore);
    this.remove(child.realAfter);
    // 释放删除项 effect
    child.effect.dispose();
    child.effect = undefined;
    child.data = undefined;
    child.context = undefined;
    after[FakeNode] = undefined;
    child.forNode = undefined;
    child.realParent = undefined;
    child.realAfter = undefined;
    child.realBefore = undefined;
  }

  reuseForItem(
    child: ForItemNode,
    data: any,
    itemExp: string | ((value: any) => any),
    i: number,
    indexName?: string,
    /** Map/Set 等有 key 时，index 值为 key */
    indexValue?: any
  ) {
    if (typeof itemExp === 'string') {
      child.data[itemExp] = data;
      if (indexName) {
        child.data[indexName] = indexValue ?? i;
      }
    } else {
      indexName = indexName || KEY_INDEX;
      child.data[indexName] = indexValue ?? i;
    }
  }

  forItemId = 0;
  createForItem(forNode: ForNode, i: number, parentData: any) {
    let forItemNode: ForItemNode;
    let data: Record<any, any>;
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
    // 考虑到生成每项数据需要依赖原始响应式数组，因此无法放在 scope 里
    // 使得 for effect 依赖原响应式数组，每一项
    data = this.getItemData(forNode, i, parentData);
    const context = this.ctx.stack.peekByType(NodeSort.Context)?.node?.data;
    forItemNode = {
      id: this.forItemId++,
      __logicType: FakeType.ForItem,
      realParent: this.ctx.realParent,
      realBefore: null,
      realAfter: null,
      forNode,
      key: forNode.getKey?.(data),
      effect: null,
      data,
      context
    };
    forItemNode.effect = scope;
    return forItemNode;
  }

  getItemData(forNode: ForNode, i: number, parentData: any) {
    const { arr, itemExp, vars, arrSignal, getKey, keys } = forNode;
    let indexName = forNode.indexName;
    let data: Record<any, any>;
    if (typeof itemExp === 'string') {
      data = deepSignal(
        indexName
          ? {
              [itemExp]: arr[i],
              [indexName]: keys?.[i] ?? i
            }
          : {
              [itemExp]: arr[i]
            },
        getPulling()
      );
    } else {
      indexName = indexName ?? KEY_INDEX;
      const rawData = { [indexName]: keys?.[i] ?? i };
      data = deepSignal(rawData, getPulling());
      // 下标来源：
      // - getKey：用 data[indexName]（reactive），key 表达式求值结果作为下标，下标变更时 Computed 自动重算
      // - keys 无 getKey：用 (data[indexName], i) — 下标是静态 i（扁平数组按位置索引），
      //   但通过逗号表达式读 data[indexName] 建立依赖：reuseForItem 更新 indexName 后 Computed 感知变化并重算
      //   （Map/Set 的 reactiveArr 是 plain array，无 proxy get 陷阱，必须额外订阅 indexName）
      // - 无 keys 无 getKey：用 i — 普通数组，reactiveArr 是 proxy，reactiveArr[i] 的 get 陷阱自带 index 级依赖
      const computedData = new Computed(() =>
        itemExp((arrSignal.get(), forNode.reactiveArr)[getKey ? data[indexName] : keys ? (data[indexName], i) : i])
      );
      const cells = data[Keys.Meta].cells;
      for (let i = 0; i < vars.length; i++) {
        const name = vars[i];
        rawData[name] = undefined;
        cells.set(name, new Computed(() => computedData.get()[name]));
      }
    }

    backupSignal(data, parentData);
    return data;
  }

  getData() {
    const { node } = this.ctx.stack.peekByType(NodeSort.CtxProvider);
    return node.data;
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
      new Scope(() => {
        return this.setProp(node, key, value, hookI);
      }).get();
    } else if (typeof value === 'function') {
      new this.Effect(() => {
        const res = value(data);
        const dispose = this.setProp(node, key, res, hookI);
        return dispose;
      }, ScheduleType.Render);
    } else if (valueIsMapKey) {
      new this.Effect(() => {
        const res = data[value];
        const dispose = this.setProp(node, key, res, hookI);
        return dispose;
      }, ScheduleType.Render);
    }
    // 静态数据
    else {
      this.setProp(node, key, value, hookI);
    }
  }

  oneRealPropParsed: Interpreter['onePropParsed'] = this.onePropParsed.bind(this);

  private createComponentData(ComponentOrRender: UI | typeof Store | InlineFragment) {
    let tokenizer: Tokenizer,
      child: any,
      fragmentSnapshot: Partial<Tokenizer>,
      resumeSnapshot: Partial<Tokenizer>,
      __logicType: FakeType.Component | FakeType.Fragment;

    const isCC = (ComponentOrRender as any).prototype instanceof Store;
    if (isCC) {
      const Component = ComponentOrRender as any;
      child = Component.new();
      tokenizer = child.ui(true);
      __logicType = FakeType.Component;
    } else if (ComponentOrRender instanceof InlineFragment) {
      const conf = ComponentOrRender;
      child = deepSignal({}, getPulling(), true);
      backupSignal(child, conf.data);
      tokenizer = conf.tokenizer;
      fragmentSnapshot = conf.snapshot;
      __logicType = FakeType.Fragment;
      resumeSnapshot = tokenizer.snapshot([
        'dentStack',
        'token',
        'needIndent',
        'isFirstToken',
        'isFirstToken',
        'useDedentAsEof'
      ]);
    } else {
      const render = ComponentOrRender as UI;
      const boundStore = render.boundStore;
      child = deepSignal({}, getPulling(), true);
      if (boundStore) {
        backupSignal(child, boundStore);
      }
      tokenizer = render(true);
      __logicType = FakeType.Fragment;
    }

    return {
      data: child,
      tokenizer,
      onePropParsed: createStoreOnePropParsed(child),
      fragmentSnapshot,
      resumeSnapshot,
      __logicType
    };
  }

  componentOrFragmentDeclaration(ComponentOrRender: UI | typeof Store | InlineFragment, ctx: ProgramCtx) {
    const { data, tokenizer, onePropParsed, fragmentSnapshot, resumeSnapshot, __logicType } =
      this.createComponentData(ComponentOrRender);
    const node: ComponentNode = {
      __logicType,
      realParent: ctx.realParent,
      realBefore: null,
      realAfter: null,
      data,
      tokenizer,
      fragmentSnapshot,
      resumeSnapshot
    };
    this.onePropParsed = onePropParsed;
    node.realAfter = this.insertAnchor(node, 'component-after');
    return node;
  }
  getFn(data: any, expression: string | number) {
    return new Function('data', `with(data){return (${expression})}`).bind(undefined, safe(data));
  }
  getBoolFn(data: any, expression: string | number) {
    return new Function('data', `with(data){return Boolean(${expression})}`).bind(undefined, safeExclude(data, { 'Boolean': true }));
  }
  getAssignFn(data: any, expression: string | number) {
    const valueId = `value_bobe_${date32()}`;
    return new Function('data', valueId, `with(data){${expression}=${valueId}};`).bind(undefined, safeExclude(data, { [valueId]: true }));
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
    const context = ctx.stack.peekByType(NodeSort.Context)?.node?.data;
    const ifNode: IfNode = {
      __logicType: isElse ? FakeType.Else : isIf ? FakeType.If : FakeType.Fail,
      // 此时 token 是 exp, 下次解析 从 \n 开始
      snapshot: this.tokenizer.snapshot(),
      realParent: ctx.realParent,
      realBefore: null,
      realAfter: null,
      condition: null,
      preCond: preIsCond ? prevSibling : null,
      isFirstRender: true,
      effect: null,
      owner,
      data,
      context
    };
    let signal: SignalNode;

    switch (keyWord.value) {
      case 'if':
        if (valueIsMapKey) {
          // // 确保 signal 已生成
          // runWithPulling(() => data[value], null);
          // // 拿到 signal
          // const { cells } = data[Keys.Meta];
          signal = new Computed(() => Boolean(data[value]))
        } else {
          const fn = this.getBoolFn(data, value);
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
          const fn = valueIsMapKey ? null : this.getBoolFn(data, value);
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
            return valueIsMapKey ? Boolean(data[value]) : fn();
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
    ifNode.realAfter = this.insertAnchor(ifNode, `${keyWord.value}-after`);

    const ef = this.effect(
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
      [signal],
      { type: 'render' }
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
  private skipComponentTypeArguments(node: any, force = false) {
    if ((force || node.__logicType & TokenizerSwitcherBit) && this.tokenizer.token.type & TokenType.TypeArguments) {
      this.tokenizer.nextToken();
    }
  }

  /**
   * 首行属性 + 可选的 pipe 扩展行
   * <headerLineAndExtensions> ::= <attributeList> NEWLINE (PIPE <attributeList> NEWLINE)*
   */
  headerLineAndExtensions(_node: any) {
    const { tokenizer } = this;
    do {
      const isComponent = _node.__logicType & TokenizerSwitcherBit;
      const isTp = _node.__logicType === FakeType.Tp;
      let snapshot: Partial<Tokenizer>, dentLen: number;
      const data = this.getData();
      const unHandledKey = this.attributeList(_node, data);
      // 为行内模板片段准备快照，当前 token 是 NEWLINE，快照需要包含换行符，所以 -1
      if (isComponent || isTp) {
        snapshot = tokenizer.snapshot(undefined, -1);
        dentLen = tokenizer.dentStack[tokenizer.dentStack.length - 1];
      }
      tokenizer.nextToken(); // NEWLINE
      if ((tokenizer.token.type & TokenType.Pipe) === 0) {
        // 是 indent, 且当前节点是组件节点，记录行内模板起始快照，
        // 跳过行内模板片段解析
        if (isComponent && tokenizer.token.type & TokenType.Indent) {
          this.inlineFragment(_node, snapshot, data, unHandledKey);
          tokenizer.skip(dentLen);
          if ((tokenizer.token.type & TokenType.Pipe) === 0) {
            break;
          }
        } else if (isTp) {
          _node.snapshot = snapshot;
          break;
        } else {
          break;
        }
      }
      tokenizer.nextToken(); // PIPE
    } while (true);
  }

  /**
   * 1. 快照
   * 2. 跳过 行内模板片段
   * 3. 准备
   *    1. tokenizer
   *    2. 快照
   *    3. 使用 CtxProvider 中 数据作为 data
   */
  inlineFragment(_node: any, snapshot: Partial<Tokenizer>, data: any, key = 'children') {
    const value = new InlineFragment(snapshot, data, key, this.tokenizer);
    this.onePropParsed(data, _node, key, value, false, true);
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
  attributeList(_node: any, data: any) {
    let key: string, eq: any;
    while ((this.tokenizer.token.type & TokenType.NewLine) === 0) {
      // 取 key
      if (key == null) {
        const keyValue = this.tokenizer.token.value
        // 如果 key 是 children 语法糖指定的类型：字符串 | 静态插值 | 动态插值
        if (this.tokenizer.token.type & ChildrenSugarType || typeof keyValue === 'string' && keyValue.startsWith(this.tokenizer.HookId)) {
          key = 'children';
          eq = '=';
          // 将 key 的 token 作为 value 后续循环判断
          continue;
        } else {
          key = this.tokenizer.token.value as any;
        }
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

        if (key === 'props') {
          let prevKeys = new Set<any>();
          const savedDefaults = new Map<string, any>();
          new this.Effect(() => {
            const props = isFn ? rawVal : Reflect.has(data[Keys.Raw], value) ? data[value] : this.getFn(data, value)();
            const isComponent = _node.__logicType & TokenizerSwitcherBit;
            const rawTarget = isComponent ? _node.data[Keys.Raw] : null;

            const cleanupKeys = (keysToClean: Set<string>) => {
              for (const k of keysToClean) {
                if (k.startsWith('on')) continue;
                if (isComponent) {
                  _node.data[k] = savedDefaults.has(k) ? savedDefaults.get(k) : undefined;
                } else {
                  this.setProp(_node, k, undefined, hookI);
                }
              }
            };

            if (!props || typeof props !== 'object') {
              cleanupKeys(prevKeys);
              prevKeys.clear();
              return;
            }

            props[Keys.Iterator];
            const raw = props[Keys.Raw] || props;
            const keys = Object.keys(raw);
            const newKeys = new Set();
            for (let i = 0; i < keys.length; i++) {
              const k = keys[i];
              newKeys.add(k);
              prevKeys.delete(k);
              if (isComponent) {
                const savedK = savedDefaults.has(k);
                if (!savedK && hasOwn(rawTarget, k)) {
                  savedDefaults.set(k, rawTarget[k]);
                }
                const val = props[k];
                _node.data[k] = val === undefined && savedK ? savedDefaults.get(k) : val;
              } else {
                this.onePropParsed(props, _node, k, k, true, false, hookI);
              }
            }

            cleanupKeys(prevKeys);
            prevKeys = newKeys;
          }, ScheduleType.Render);
        }
        // ref 应该将对应 key 值分配给 ref
        else if (key === 'ref') {
          const valueIsMapKey = Reflect.has(data[Keys.Raw], value);
          let refValue = _node;
          if (_node.__logicType & TokenizerSwitcherBit) {
            refValue = _node.data;
          } else {
            refValue[Keys.ProxyFreeObject] = true;
          }

          if (valueIsMapKey) {
            data[value] = refValue;
            new Scope(() => () => {
              data[value] = null;
            }).get();
          } else {
            const fn = this.getAssignFn(data, value);
            // 执行赋值操作
            fn(refValue);
            new Scope(() => () => {
              fn(null);
            }).get();
          }
        }
        // 动态的要做成函数
        else if (hookType === 'dynamic') {
          const valueIsMapKey = Boolean(getProxyHasKey(data, value));
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
        key = undefined;
        eq = undefined;
      }
      this.tokenizer.nextToken();
    }
    return key;
  }

  config(opt: TerpConf) {
    Object.assign(this, opt);
    this.opt = opt;
    if (opt.noopEffect) {
      this.effect = noopEffect as any as typeof effect;
      this.Effect = NoopEffect as any as typeof Effect;
    }
  }

  createNode(name: string): any {
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

  createAnchor(name: string, isBefore?: boolean): any {
    return {
      name,
      nextSibling: null,
      isBefore
    };
  }

  insertAfter(parent: any, node: any, prev: any) {
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

  remove(node: any, parent?: any, prevSibling?: any) {
    const next = node.nextSibling;
    if (prevSibling) {
      prevSibling.nextSibling = next;
    }
    if (parent.firstChild === node) {
      parent.firstChild = next;
    }
  }

  setProp(node: any, key: string, value: any, hookI?: number): any | ((isDestroy: boolean) => void) {
    node.props[key] = value;
  }

  beforeIndent?: (node: any) => boolean | void;
  leaveNode?: (node: any, isDedent: boolean) => void;
  beforeLogicIndent?: (node: any) => void;
  leaveLogicNode?: (node: any, isDedent: boolean) => void;

  Effect = Effect;
  effect = effect;
}

function createStoreOnePropParsed(child: any) {
  const onePropParsed: Interpreter['onePropParsed'] = (data, _, key, value, valueIsMapKey, isFn, hookI) => {
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
        const computed = new Computed(() => value(data));
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
  return onePropParsed;
}
