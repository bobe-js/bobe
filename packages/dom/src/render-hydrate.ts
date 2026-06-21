import { customRender, Interpreter, Store } from 'bobe';
import {
  setProp as browserSetProp,
  createNode as browserCreateNode,
  remove,
  firstChild,
  nextSib,
  CONTENT_FLAG
} from './render';

// ====== TreeCursor ======

/**
 * SSR DOM 认领游标。
 *
 * 工作方式：
 * - 维护一个 `parent` 指针，始终指向"当前容器"。
 * - `findUnclaimed` 只在 `parent.firstChild` 中平铺搜索（只搜一层，不递归）。
 * - 认领过的节点放入 `claimed` WeakSet，同一次遍历不会重复认领。
 *
 * 典型调用（以 hydrate 测试为例）：
 *   container.innerHTML = ssrHtml;                    // <div id="app1"><div>SSR...</div></div>
 *   hydrate(Ctor, container);
 *
 * hydrate 内部：
 *   cursor = new TreeCursor(rootEl.parentNode);       // 光标起点 = container，即 <div id="app1">
 *   createNode('div') → findUnclaimed 搜 <div id="app1"> 的直接子级 → 找到 rootEl → 认领 ✅
 *   beforeIndent → enterChildren(rootEl)              // 光标进入 rootEl
 *   createNode('nav') → findUnclaimed 搜 rootEl 的直接子级 → 找到 SSR <nav> → 认领 ✅
 *
 * 关键约束：游标只在当前层级搜索。这就是为什么光标起点必须在 container 层——让 App 的
 * 外层 div 在 container 的子级中被认领，而不是在 <body> 层误将 #app 当 div 认领走。
 */
class TreeCursor {
  /** 当前搜索容器——findUnclaimed 在此节点的 firstChild 链上搜索 */
  private parent: Node;
  /** 已认领节点集合，防止 DOM 重排导致误认领 */
  private claimed = new WeakSet<Node>();
  /** 当前层级最后一个被认领的节点，搜索从 nextSibling 起跳，跳过已遍历节点 */
  private current: Node | null = null;

  constructor(container: Node) {
    this.parent = container;
  }

  /** 进入子节点：后续 findUnclaimed 搜 node 的直接子级 */
  enterChildren(node: Node) {
    this.parent = node;
    this.current = null;
  }

  /** 直接设置游标父级（用于 tp 等需要跳转到非树位置的场景） */
  setParent(node: Node) {
    this.parent = node;
    this.current = null;
  }

  /** 设置当前指针，后续 findUnclaimed 从 node.nextSibling 开始 */
  setCurrent(node: Node) {
    this.current = node;
  }

  /** 退出当前节点，回到父级，恢复游标位置 */
  leaveToParent(node: Node) {
    if (node === this.parent && this.parent.parentNode) {
      this.parent = this.parent.parentNode;
      this.current = node;
    }
  }

  /** 在 this.parent 的 firstChild 链上查找第一个满足条件的节点 */
  private findUnclaimed(predicate: (node: Node) => boolean): Node | null {
    // 指针起跳 + WeakSet 兜底：指针失效（DOM 重排）时 wrapped 扫描，WeakSet 防重认
    let node = this.current?.nextSibling || this.parent.firstChild;
    while (node) {
      if (!this.claimed.has(node) && predicate(node)) {
        this.claimed.add(node);
        this.current = node;
        return node;
      }
      node = node.nextSibling;
    }
    return null;
  }

  /** 认领一个未使用的元素节点（按 tagName 匹配） */
  tryClaimElement(tagName: string): Element | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 1 && (node as Element).tagName.toLowerCase() === tagName
    ) as Element | null;
  }

  /** 认领一个未使用的注释节点（按注释内容匹配） */
  tryClaimComment(name: string): Comment | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 8 && (node as Comment).data === name
    ) as Comment | null;
  }

  /** 认领一个未使用的文本节点（非空文本） */
  tryClaimText(): Text | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 3 && !!(node.textContent?.trim())
    ) as Text | null;
  }
}

// ====== 回调 ======

export const hydrate = (ComponentClass: typeof Store, rootEl: Element) => {
  const cursor = new TreeCursor(rootEl);
  // 首屏 render 期间（含 flushMicroEffectManual 中的 for/if effect 首次执行）为 true
  // 后续响应式更新为 false，createNode/createAnchor 直接创建新节点
  let isFirstRender = true;

  // 首屏时 text/html 的 DOM 内容已由 SSR 生成，跳过 innerHTML/textContent 赋值避免重绘
  // 但仍需设 CONTENT_FLAG 保证 beforeIndent 冲突检测正常
  function setProp (node: Node, key: string, value: any) {
    if (isFirstRender && (key === 'children' || key === 'html')) {
      (node as any)[CONTENT_FLAG] = value != null;
      return;
    }
    return browserSetProp.call(this,node, key, value);
  };

  function createNode (this: Interpreter, name: string): Node {
    const doc = this.root?.ownerDocument || document;
    if (isFirstRender) {
      const claimed = name === 'text'
        ? cursor.tryClaimText()
        : cursor.tryClaimElement(name);
      if (claimed) return claimed;
    }
    return name === 'text'
      ? doc.createTextNode('')
      : browserCreateNode.call(this, name);
  };

  function createAnchor (name: string): Comment {
    const doc = this.root?.ownerDocument || document;
    if (isFirstRender) {
      const claimed = cursor.tryClaimComment(name);
      if (claimed) return claimed;
    }
    return doc.createComment(name);
  };

  function insertAfter(parent: Node, node: Node, prev: Node | null) {
    if (node === parent) return;
    const expectedNext = prev ? prev.nextSibling : parent.firstChild;
    if (node === expectedNext) return;
    parent.insertBefore(node, expectedNext);
  };

  function  beforeIndent(node: Node): boolean | void {
    if ((node as any)[CONTENT_FLAG]) {
      const tag = (node as Element).tagName?.toLowerCase();
      const hasText = (node as HTMLElement).textContent != null;
      console.warn(
        `<${tag}> has ${hasText ? 'text' : 'html'} content and child elements — children ignored`
      );
      return false;
    }
    if (isFirstRender) cursor.enterChildren(node);
  };

  function leaveNode (node: Node) {
    if (isFirstRender) cursor.leaveToParent(node);
  };

  // tp 节点进入 indent 时，将游标切入目标 DOM，使其子节点在正确位置认领
  function beforeLogicIndent (node: any) {
    if (isFirstRender && node.tpData) {
      const targetDom = node.tpData.node;
      if (targetDom) cursor.enterChildren(targetDom);
    }
  };

  function leaveLogicNode (node: any, _isDedent: boolean) {
    // tp 节点离开时，通过 realAfter 锚点找到模板父级 DOM 恢复游标
    if (isFirstRender && node.tpData) {
      const parentDom = node.realAfter?.parentNode;
      if (parentDom) {
        cursor.setParent(parentDom);
        // 后续认领从 tp-after 锚点之后开始
        if (node.realAfter) cursor.setCurrent(node.realAfter);
      }
      return;
    }
    if (isFirstRender) cursor.leaveToParent(node);
  };

  const render = customRender({
    createNode,
    setProp,
    insertAfter,
    createAnchor,
    remove,
    firstChild,
    nextSib,
    beforeIndent,
    beforeLogicIndent,
    leaveNode,
    leaveLogicNode,
    // program() 遍历完模板后、flushMicroEffectManual 首次执行 effect 前切回首屏标志
    // 后续 for/if effect 中的 createNode 走浏览器新建路径，不再尝试从 SSR DOM 认领
    onBeforeFlush: () => {
      isFirstRender = false;
    }
  });

  return render(ComponentClass, rootEl);
};
