export class SSRNode {
  type: SSRNodeType;
  // 链表
  parent?: SSRNode | null = null;
  firstChild: SSRNode | null = null;
  lastChild: SSRNode | null = null; // O(1) 尾插
  nextSibling: SSRNode | null = null;
  prevSibling: SSRNode | null = null;
  closed: boolean = false;
  startClosed: boolean = false;
  // innerHTML 缓存
  _innerHtml: string | null = null;
}

export enum SSRNodeType {
  Element,
  Text,
  Anchor,
  Root
}

export class Element extends SSRNode {
  type = SSRNodeType.Element;
  textContent: string | null = null;

  attrs: Record<string, string> = {};
  constructor(
    /** 标签名 */
    public value: string,
    public parent?: SSRNode | null
  ) {
    super();
  }
}

export class Text extends SSRNode {
  type = SSRNodeType.Text;
  constructor(
    /** 文本内容 */
    public textContent: string,
    public parent?: SSRNode | null
  ) {
    super();
  }
}

export class Anchor extends SSRNode {
  type = SSRNodeType.Anchor;
  constructor(
    /** 注释内容 */
    public value: string,
    public parent?: SSRNode | null
  ) {
    super();
  }
}
export class Root extends SSRNode {
  type = SSRNodeType.Root;
  constructor(
    /** 输出  HTML */
    public value: string,
    public parent?: SSRNode | null
  ) {
    super();
  }
}

export type SSRCtx = {
  /** 根节点 */
  root: Root;
  /** 当前节点 */
  current: SSRNode;
};
