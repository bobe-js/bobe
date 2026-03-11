/**
 * 节点包装单元的内部结构
 */
interface StackNode<T, K extends string | number> {
  data: T;
  type: K;
  prev: StackNode<T, K> | null; // 基础栈指向
  prevSameType: StackNode<T, K> | null; // 指向同类型的前一个包装单元
}

export class TypedStack<T, K extends string | number> {
  private top: StackNode<T, K> | null = null;

  // 存储每种类型最近一次出现的包装单元引用
  // 使用 Record 来动态支持不同的类型标签
  private lastNodes: Partial<Record<K, StackNode<T, K> | null>> = {};
  length = 0;

  /**
   * @param rawNode 原始节点数据
   * @param type 节点类型
   */
  push(rawNode: T, type: K): void {
    const newNode: StackNode<T, K> = {
      data: rawNode,
      type: type,
      prev: this.top,
      prevSameType: this.lastNodes[type] ?? null
    };

    this.top = newNode;
    this.length++;
    this.lastNodes[type] = newNode;
  }

  /**
   * 出栈操作
   * @returns 原始节点数据或 null
   */
  pop(): T | null {
    if (!this.top) return null;

    const popped = this.top;

    // 弹栈时，恢复该类型的上一个记录点
    this.lastNodes[popped.type] = popped.prevSameType;
    this.top = popped.prev;
    this.length--;
    return popped.data;
  }

  /**
   * O(1) 获取栈顶节点的前一个同类型节点
   */
  getPrevSameType(type?: K): T | null {
    if (!type) {
      return this.top?.prevSameType?.data;
    }
    return this.lastNodes[type]?.prevSameType?.data;
  }

  findPrevSameType(cb: (node: T) => boolean): T | null {
    if (!this.top) {
      return null;
    }
    let point = this.top.prevSameType;
    while (point) {
      if (cb(point.data)) {
        return point.data;
      }
      point = point.prevSameType;
    }
    return null;
  }

  /**
   * 获取当前栈顶的类型
   */
  peekType(): K | null {
    return this.top?.type;
  }
  /**
   * 获取栈顶元素
   */
  peek() {
    return this.top.data;
  }

  peekByType(type: K) {
    return this.lastNodes[type]?.data;
  }
}
