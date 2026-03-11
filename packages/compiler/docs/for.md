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

1. Terp 可切换 Tokenizer
2. Tokenizer 可以 skip 、snapshot、resume