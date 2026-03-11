1. 遇到 for 标签，有两个维度
   1. 预处理，遇到 for item 保存 **ProgramCtx**，
      其中 stack 可忽略，等到 dedent 时会一样，其余均需缓存
      prevSibling 可忽略，prevSibling 采用 for 节点自己的， for item 只知道 真实父节点
      考虑 current 如何处理
   2. for 循环遍历数组
      1. 获取 item ，index, key， 使用  `const forCtx = Object.create(store)`
      2. 遍历 for 下方的元素 (嵌套在遍历数组的循环中)，下面为一次循环
         1. 首屏直接放行
         2. 等待整个子树完成，即 for 对应的 Dedent 触发时
         3. 通过 **resume** 重新让其回到 for 循环 开始执行时的 token，同时 **ProgramCtx** 也恢复遇到 for item 时



# 基于循环

1. 逻辑、
2. 一个组件一个 tkr
3. Terp 可切换子 tkr，**即任何节点解析都依赖  最近的 组件节点.tokenizer**
4. Tokenizer 可以 skip 、snapshot、resume，
   1. 其中 snapshot 应存储在逻辑节点中
   2. 当逻辑为 true 时 resume 恢复 token 并执行对应代码，
      1. 确定恢复时应该使用的上下文？只能存储在 if 中
5. 重新渲染一个片段需要知道哪些：
   1. 挂载位置
   2. 数据上下文
   3. 渲染的代码片段


# 目前逻辑

首屏 渲染执行流程

1. render
2. const ins = App.new()
3. return ins.ui => program;

​    3.1 bobe

​    3.2 new Tkr(); cmp.tkr = tkr

​    3.3 const componentNode = cmp.program()  // 此节点需要考虑 after，其余节点 after = null

​        3.3.1 Component 节点，阻断上下文 for item  与 fragment 会增加上下文

​       3.3.2 

​        ... 递归执行 3.

​       3.3.3 将 component 所有子节点挂载到 realParent 上

# 需要变动

1. hook 由 tokenizer 管理, _hook 增加一个 hookI 返回值
2. init 由 tokenizer 管理
3. 





```ts
// 1. 定义类别枚举
type Category = 'A' | 'B' | 'C';

// 2. 定义节点结构
interface StackNode<T, C extends string> {
  value: T;
  categories: C[];
  prevGlobal: StackNode<T, C> | null;
  // 核心：记录在该节点加入时，各个类别的上一个节点是谁
  prevByCategory: Partial<Record<C, StackNode<T, C>>>;
}

class MultiCategoryStack<T, C extends string> {
  // 记录全局栈顶
  private top: StackNode<T, C> | null = null;
  
  // 记录每个类别的当前最新节点（各分类的“栈顶”）
  private categoryTops: Partial<Record<C, StackNode<T, C>>> = {};

  /**
   * 入栈操作
   * @param value 数据
   * @param categories 该节点所属的类别数组
   */
  push(value: T, categories: C[]): void {
    const newNode: StackNode<T, C> = {
      value,
      categories,
      prevGlobal: this.top,
      prevByCategory: {},
    };

    // 为该节点分配每个类别的“上一个节点”指针
    for (const cat of categories) {
      newNode.prevByCategory[cat] = this.categoryTops[cat] || undefined;
      // 更新该类别的最新指向为当前节点
      this.categoryTops[cat] = newNode;
    }

    // 更新全局栈顶
    this.top = newNode;
  }

  /**
   * 出栈操作
   */
  pop(): T | undefined {
    if (!this.top) return undefined;

    const poppedNode = this.top;

    // 回溯：将受影响类别的顶部指针恢复到该节点记录的 prevByCategory
    for (const cat of poppedNode.categories) {
      this.categoryTops[cat] = poppedNode.prevByCategory[cat];
    }

    // 更新全局栈顶
    this.top = poppedNode.prevGlobal;

    return poppedNode.value;
  }

  /**
   * 获取某个类别的当前“顶部”元素
   */
  peekCategory(cat: C): T | undefined {
    return this.categoryTops[cat]?.value;
  }

  /**
   * 获取全局栈顶
   */
  peek(): T | undefined {
    return this.top?.value;
  }
  
  /**
   * 1. 全局向前遍历 (不分类)
   * 从栈顶开始，沿着全局链条向栈底遍历
   */
  forEach(callback: (value: T) => boolean): void {
    let current = this.top;
    
    while (current !== null) {
      // 执行回调，如果返回 false 则立即停止
      const shouldContinue = callback(current.value);
      if (!shouldContinue) break;
      
      current = current.prevGlobal;
    }
  }

  /**
   * 2. 按类别向前遍历
   * 仅遍历属于指定类别 cat 的节点
   */
  forEachByCategory(cat: C, callback: (value: T) => boolean): void {
    // 从该类别的当前“顶端”节点开始
    let current = this.categoryTops[cat];

    while (current) {
      const shouldContinue = callback(current.value);
      if (!shouldContinue) break;

      // 关键点：直接跳向该节点记录的“上一个同类节点”
      // 这比遍历全局栈再筛选类别要快得多 (O(m) vs O(n))
      current = current.prevByCategory[cat];
    }
  }
}
```

