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

class TreeCursor {
  private parent: Node;
  private claimed = new WeakSet<Node>();

  constructor(container: Node) {
    this.parent = container;
  }

  enterChildren(node: Node) {
    this.parent = node;
  }

  leaveToParent(node: Node) {
    if (node === this.parent && this.parent.parentNode) {
      this.parent = this.parent.parentNode;
    }
  }

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

  tryClaimElement(tagName: string): Element | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 1 && (node as Element).tagName.toLowerCase() === tagName
    ) as Element | null;
  }

  tryClaimComment(name: string): Comment | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 8 && (node as Comment).data === name
    ) as Comment | null;
  }

  tryClaimText(): Text | null {
    return this.findUnclaimed(
      (node) => node.nodeType === 3 && !!(node.textContent?.trim())
    ) as Text | null;
  }
}

// ====== 回调 ======

export const hydrate = (ComponentClass: typeof Store, rootEl: Element) => {
  const container = rootEl.parentNode!;
  const cursor = new TreeCursor(container);
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

  return render(ComponentClass, container);
};
