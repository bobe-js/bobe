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



在 Vapor 编译 `v-for` 时，它会为每个项生成类似下面的伪代码逻辑：

JavaScript

```
// Vapor 编译后的伪代码思路
function renderItem(ctx) {
  const el = createElement('div')
  
  // 建立一个 Effect，追踪当前 ctx.item 的变化
  renderEffect(() => {
    setText(el, ctx.item.value) 
  })
  
  return el
}
```

- **关键点**：当旧的 `key: 'a'` 被替换为新的 `key: 'a'` 时，Vapor 会更新该 DOM 节点对应的上下文（Context）中的 `item` 引用。
- **触发响应**：由于 `renderEffect` 依赖了 `item` 这个数据源，当数据源引用发生替换时，Effect 会被重新触发。
- **结果**：DOM 没动（没有 `removeChild` 再 `appendChild`），但是里面的文本内容（`setText`）被精准地更新为了新对象的值。



# 目前逻辑

首屏 渲染执行流程

1. render
2. const ins = App.new()
3. return ins.ui => program;

​    3.1 bobe

​    3.2 new Tkr(); cmp.tkr = tkr

​    3.3 const componentNode = cmp.program()  // 此节点需要考虑 after，其余节点 after = null

​        3.3.1 Component 节点，阻断上下文 for item  与 fragment 会增加上下文

​        3.3.2 逻辑节点，init 时记住当前上下文，否则后续无法使用上下文渲染内部内容

​        ... 递归执行 3.

​       3.3.3 将 component 所有子节点挂载到 realParent 上

# For 逻辑

## 首屏

1. 解析出  arr 对应响应式值
2. 存储 index = 0
3. effect 创建每个 item：
   1. data  ForNode.data = ` $({ item, index })` extends parentData
   2. 创建 forItemScope 用于在 item 被删除时删除其内部的 setProps effects

4. 使用 item 0 代替 for 入栈
5. 插入 for after
6. 插入 item0 after
7. 把渲染项按顺序插入
8. ......
9. 解析到 Dedent 时
   10. 将 item0 出栈,
   11. 对比 ForNode 中 index 和 length

       1. index < length 继续执行,
          1. 设置 prevSibling = item0, current= item1
          2. resume 到 for 条件下面的片段，相当于再次从 for 开始进栈
          3. 重复 2 ~ 7

       2. 循环完成，prevSibling = forNode,prevSibling, current = forNode


## 更新

1. 如何在 item 跟新，但 内容没跟新，如 从后端重新取数据，不触发 dom 更新
   1. 更新 foritem.data[itemKey] 
   2. setProp effect 采用 data[itemKey] xxx 进行绑定，这样itemKey 跟新了， 会重新获取 新数据.xxx
   3. setProp effect 采用 data[itemKey] 进行绑定，若新 item 值相同，effect 不会触发
2. 替换 tokenizer 为 owner tokenizer.useDedentAsEof = true;
3. 无 key , 将数组中的数据更新到 foritem.data 中


# 一个 for item

```ts
type ForNode = {
  realParent: any;
  realBefore?: any;
  realAfter?: any;
}

// 最长

for arr ; item i ; key={}
// 1. 使用 item, i 声明
const itemData = $({ item, i });

Object.sePrototype(itemData, parentData);

// 2. 处理 item 解构
为解构表达式中每一个值创建 computed
通过computed 能获取 item 对应的数据

```

6. 
