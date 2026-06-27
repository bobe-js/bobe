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

  attrs: Record<string, string | undefined> = {};
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


export class SSRFiber {
  parent?: SSRFiber = undefined;
  next?: SSRFiber = undefined;
  child?: SSRFiber = undefined;
  html?: string = undefined;
  /** 开标签 > 在原始 HTML 字符串中的索引位置 */
  openTagEnd?: number = undefined;
  constructor(public type: any, public props: Record<any, any> = {}) {}

  querySelector(selector: string): SSRFiber | null {
    // 解析 selector：tag#id.class1.class2
    const idMatch = selector.match(/#([\w-]+)/);
    const id = idMatch ? idMatch[1] : null;
    const classMatches = selector.match(/\.[\w-]+/g);
    const classes = classMatches ? classMatches.map(c => c.slice(1)) : [];
    const tag = selector.replace(/#[\w-]+/g, '').replace(/\.[\w-]+/g, '').trim() || null;
    const addStringTokens = (tokens: Set<string>, value: string) => {
      for (const token of value.split(/\s+/)) {
        if (token) tokens.add(token);
      }
    };
    const addObjectTokens = (tokens: Set<string>, value: Record<string, any>) => {
      for (const [k, v] of Object.entries(value)) {
        if (v) tokens.add(k);
      }
    };
    const collectClasses = (props: Record<string, any>) => {
      const tokens = new Set<string>();
      const classValue = props['class'];
      if (classValue != null) {
        if (Array.isArray(classValue)) {
          for (const item of classValue) {
            if (typeof item === 'string') {
              addStringTokens(tokens, item);
            } else if (item && typeof item === 'object' && !Array.isArray(item)) {
              addObjectTokens(tokens, item as Record<string, any>);
            }
          }
        } else if (typeof classValue === 'object') {
          addObjectTokens(tokens, classValue as Record<string, any>);
        } else {
          addStringTokens(tokens, String(classValue));
        }
      }
      return tokens;
    };

    // 深度优先遍历 child → next 链表
    const walk = (node: SSRFiber | undefined): SSRFiber | null => {
      if (!node) return null;
      // 跳过非元素节点
      if (node.type !== 'root' && node.type !== 'anchor' && node.type !== 'text') {
        if (!tag || node.type === tag) {
          if (!id || node.props['id'] === id) {
            const classTokens = collectClasses(node.props);
            if (classes.length === 0 || classes.every(c => classTokens.has(c))) {
              return node;
            }
          }
        }
      }
      return walk(node.child) || walk(node.next);
    };

    return walk(this.child);
  }

  getElementById(id: string): SSRFiber | null {
    return this.querySelector(`#${id}`);
  }
}
