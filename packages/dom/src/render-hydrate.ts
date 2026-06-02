import { customRender, Store } from 'bobe';
import {
  setProp,
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
  /** 已认领节点集合，避免同一次遍历中重复认领 */
  private claimed = new WeakSet<Node>();

  constructor(container: Node) {
    this.parent = container;
  }

  /** 进入子节点：后续 findUnclaimed 搜 node 的直接子级 */
  enterChildren(node: Node) {
    this.parent = node;
  }

  /** 退出当前节点，回到父级 */
  leaveToParent(node: Node) {
    if (node === this.parent && this.parent.parentNode) {
      this.parent = this.parent.parentNode;
    }
  }

  /** 在 this.parent 的 firstChild 链上查找第一个满足条件且未被认领的节点 */
  private findUnclaimed(predicate: (node: Node) => boolean): Node | null {
    let node = this.parent.firstChild;
    while (node) {
      if (!this.claimed.has(node) && predicate(node)) {
        this.claimed.add(node);
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
  const hydrateSetProp = (node: Node, key: string, value: any) => {
    if (isFirstRender && (key === 'text' || key === 'html')) {
      (node as any)[CONTENT_FLAG] = value != null;
      return;
    }
    return setProp(node, key, value);
  };

  const createNode = (name: string): Node => {
    if (isFirstRender) {
      const claimed = name === 'text'
        ? cursor.tryClaimText()
        : cursor.tryClaimElement(name);
      if (claimed) return claimed;
    }
    return name === 'text'
      ? document.createTextNode('')
      : browserCreateNode(name);
  };

  const createAnchor = (name: string): Comment => {
    if (isFirstRender) {
      const claimed = cursor.tryClaimComment(name);
      if (claimed) return claimed;
    }
    return document.createComment(name);
  };

  const insertAfter = (parent: Node, node: Node, prev: Node | null) => {
    if (node === parent) return;
    const expectedNext = prev ? prev.nextSibling : parent.firstChild;
    if (node === expectedNext) return;
    parent.insertBefore(node, expectedNext);
  };

  const beforeIndent = (node: Node): boolean | void => {
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

  const leaveNode = (node: Node) => {
    if (isFirstRender) cursor.leaveToParent(node);
  };

  const leaveLogicNode = (node: Node) => {
    if (isFirstRender) cursor.leaveToParent(node);
  };

  const render = customRender({
    createNode,
    setProp: hydrateSetProp,
    insertAfter,
    createAnchor,
    remove,
    firstChild,
    nextSib,
    beforeIndent,
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
