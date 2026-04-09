import { Tokenizer } from './tokenizer';
import {
  NodeType,
  Program,
  TemplateNode,
  ElementNode,
  Property,
  PropertyValue,
  ConditionalNode,
  LoopNode,
  PropertyKeyNode,
  BaseNode,
  ComponentNode
} from './type-ast';
import { TokenType, FakeType, SourceLocation } from './type';

export class Compiler {
  constructor(
    public tokenizer: Tokenizer,
    public hooks: ParseHooks = {}
  ) {}

  /**
   * 编译程序入口，生成AST
   */
  @NodeHook
  parseProgram(): Program {
    this.tokenizer.nextToken();

    const body: TemplateNode[] = [];

    // 解析文档主体内容
    while (!this.tokenizer.isEof()) {
      const node = this.templateNode();
      if (node) {
        body.push(node);
      }
    }

    return {
      type: NodeType.Program,
      body,
      loc: {
        start: { offset: 0, line: 1, column: 0 },
        end: { offset: this.tokenizer.preI, line: this.tokenizer.line, column: this.tokenizer.column },
        source: this.tokenizer.code
      }
    };
  }

  handleChildren(): TemplateNode[] {
    const children: TemplateNode[] = [];
    if (this.tokenizer.token.type & TokenType.Indent) {
      this.tokenizer.nextToken(); // 跳过缩进
      while (!(this.tokenizer.token.type & TokenType.Dedent) && !this.tokenizer.isEof()) {
        const child = this.templateNode();
        if (child) {
          children.push(child);
        }
      }
      if (this.tokenizer.token.type & TokenType.Dedent) {
        this.tokenizer.nextToken(); // 跳过去缩进
      }
    }
    return children;
  }

  /**
   * 解析模板节点
   */
  private templateNode(): TemplateNode | null {
    const token = this.tokenizer.token;

    const [hookType, value] = this.tokenizer._hook({});

    // 检查是否为特殊关键字
    if (value === 'if' || value === 'else' || value === 'fail') {
      return this.parseConditionalNode();
    }
    if (value === 'for') {
      return this.parseLoopNode();
    }
    if (hookType) {
      return this.parseComponentNode();
    }
    // 解析普通元素节点
    return this.parseElementNode();
    // // 解析普通元素节点
    // return this.parseElementNode();
  }

  /**
   * 解析元素节点
   */
  @NodeHook
  @NodeLoc
  parseComponentNode(node?: ComponentNode) {
    const tagToken = this.tokenizer.token;
    // 获取标签名
    const tagName = tagToken.value as string;
    this.tokenizer.nextToken(); // 跳过标签名

    // 解析属性
    const props: Property[] = this.headerLineAndExtensions();
    node.type = NodeType.Component;
    node.componentName = tagName;
    node.props = props;
    this.hooks.parseComponentNode?.propsAdded?.call(this, node);

    // 解析子节点
    const children = this.handleChildren();

    node.children = children;
    return node;
  }
  /**
   * 解析元素节点
   */
  @NodeHook
  @NodeLoc
  parseElementNode(node?: ElementNode) {
    const tagToken = this.tokenizer.token;
    // 获取标签名
    const tagName = tagToken.value as string;
    this.tokenizer.nextToken(); // 跳过标签名

    // 解析属性
    const props: Property[] = this.headerLineAndExtensions();
    node.type = NodeType.Element;
    node.tagName = tagName;
    node.props = props;
    this.hooks.parseElementNode?.propsAdded?.call(this, node);

    // 解析子节点
    const children = this.handleChildren();

    node.children = children;
    return node;
  }

  /**
   * 解析条件节点（if/else/fail）
   */
  @NodeHook
  @NodeLoc
  parseConditionalNode(node?: ConditionalNode) {
    const keyword = this.tokenizer.token.value as string;

    // 获取条件表达式
    this.tokenizer.condExp();
    const condition = this.parsePropertyValue();
    this.tokenizer.nextToken(); // 跳过 cond
    this.tokenizer.nextToken(); // 跳过 \n
    node.type = keyword === 'if' ? NodeType.If : keyword === 'else' ? NodeType.Else : NodeType.Fail;
    node.condition = condition;
    this.hooks.parseConditionalNode?.propsAdded?.call(this, node);
    // 解析条件成立时的内容
    const children = this.handleChildren();

    node.children = children;

    return node;
  }

  /**
   * 解析循环节点（for）
   */
  @NodeHook
  @NodeLoc
  parseLoopNode(node?: LoopNode) {
    // 跳过 'for' 关键字
    // 解析循环表达式
    this.tokenizer.nextToken();
    const collection = this.parsePropertyValue();

    this.tokenizer.nextToken(); // 跳过分号
    const itemToken = this.tokenizer.nextToken(); // item 表达式
    const isDestruct = itemToken.type === TokenType.InsertionExp;
    if (isDestruct) {
      itemToken.value = '{' + itemToken.value + '}';
    }
    const item = this.parsePropertyValue();

    let char = this.tokenizer.peekChar(),
      key: PropertyValue | undefined,
      index: PropertyValue | undefined;
    if (char === ';') {
      this.tokenizer.nextToken(); // 分号
      if (this.tokenizer.peekChar() !== '\n') {
        this.tokenizer.jsExp();
        key = this.parsePropertyValue();
      }
    } else if (char === '\n') {
    }
    // 下一个是 indexName
    else {
      this.tokenizer.nextToken();
      index = this.parsePropertyValue();
      if (this.tokenizer.peekChar() === ';') {
        this.tokenizer.nextToken(); // 分号
        if (this.tokenizer.peekChar() !== '\n') {
          this.tokenizer.jsExp();
          key = this.parsePropertyValue();
        }
      }
    }
    // 跳过最后一个表达式
    this.tokenizer.nextToken();
    // 跳过回车
    this.tokenizer.nextToken();
    node.type = NodeType.For;
    node.collection = collection;
    node.item = item;
    node.index = index;
    node.key = key;
    this.hooks.parseLoopNode?.propsAdded?.call(this, node);

    // 解析循环体
    const children = this.handleChildren();

    node.children = children;

    return node;
  }

  /**
   * 解析首行和扩展行的属性
   */
  private headerLineAndExtensions(): Property[] {
    const props: Property[] = [];

    // 解析首行属性
    props.push(...this.attributeList());

    // 跳过换行符
    if (this.tokenizer.token.type & TokenType.NewLine) {
      this.tokenizer.nextToken();
    }

    // 解析扩展行属性
    while (this.tokenizer.token.type & TokenType.Pipe) {
      this.tokenizer.nextToken(); // 跳过管道符
      props.push(...this.attributeList());

      // 跳过换行符
      if (this.tokenizer.token.type & TokenType.NewLine) {
        this.tokenizer.nextToken();
      }
    }

    return props;
  }

  /**
   * 解析属性列表
   */
  private attributeList(): Property[] {
    const props: Property[] = [];

    while (
      !(this.tokenizer.token.type & TokenType.NewLine) &&
      !(this.tokenizer.token.type & TokenType.Pipe) &&
      !this.tokenizer.isEof()
    ) {
      props.push(this.parseProperty());
    }

    return props;
  }

  @NodeHook
  parseProperty(node?: Property) {
    node.type = NodeType.Property;
    node.key = this.parsePropertyKey();
    const token = this.tokenizer.nextToken(); // 跳过key
    // 需要赋值
    if (token.value === '=') {
      this.tokenizer.nextToken(); // 跳过等号

      node.value = this.parsePropertyValue();
      this.tokenizer.nextToken();
    } else {
      // TODO: 报错当前
    }
    node.loc.start = node.key.loc.start;
    node.loc.end = node.value ? node.value.loc.end : node.key.loc.end;
    node.loc.source = this.tokenizer.code.slice(node.loc.start.offset, node.loc.end.offset);
    return node;
  }

  /**
   * 根据值类型创建属性 key 节点
   */
  @NodeHook
  @TokenLoc
  parsePropertyKey(node?: PropertyKeyNode) {
    node.type = NodeType.PropertyKey;
    node.key = this.tokenizer.token.value as string;
    return node;
  }
  /**
   * 根据值类型创建属性值节点
   */
  @NodeHook
  @TokenLoc
  parsePropertyValue(node?: PropertyValue) {
    const [hookType, value] = this.tokenizer._hook({});
    node.type = hookType === 'dynamic' ? NodeType.DynamicValue : NodeType.StaticValue;
    node.value = value;
    return node;
  }
}

function NodeLoc(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    _node.loc.start = this.tokenizer.token.loc.start;
    const result = target.call(this, _node);
    _node.loc.end = this.tokenizer.token.loc ? this.tokenizer.token.loc.start : this.tokenizer.getCurrentPos();
    _node.loc.source = this.tokenizer.code.slice(_node.loc.start.offset, _node.loc.end.offset);
    return result;
  };
}
function TokenLoc(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    const result = target.call(this, _node);
    _node.loc = this.tokenizer.token.loc;
    return result;
  };
}

function NodeHook(target: Function, context: ClassMethodDecoratorContext<Compiler>) {
  return function (this: Compiler, _node?: BaseNode) {
    const hook = this.hooks[context.name as keyof typeof this.hooks];
    const node = { loc: {} } as BaseNode;
    hook?.enter?.call(this, node);
    const result = target.call(this, node);
    hook?.leave?.call(this, node);
    return result;
  };
}

type PickParseProps<T> = {
  [K in keyof T as K extends `parse${string}` ? K : never]: T[K];
};

type ParseProps = PickParseProps<Compiler>;

type ParseHooks = Partial<{
  [K in keyof ParseProps]: {
    enter?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
    leave?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
    propsAdded?: (this: Compiler, ...args: Parameters<ParseProps[K]>) => void;
  };
}>;
