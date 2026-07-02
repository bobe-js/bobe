1. forItem 建立 proto, 确保 forItem 可以跟随 for 自动切换 realParent (tp 相关)
   ```ty
   const Proto = {
   	get realParent() {
   		return this.forNode.realParent;
   	}
   	set realParent() {
   	
   	}
   }
   ```

2. for 预检第一项类型， firstIsLogic
   预检到

3. 首屏渲染

   1. 如果 firstIsLogic，为每项提前插入  contentStart anchor , contentStart 记录在 forItem 中，到 indent forItem 时 prevSibling = contentStart，即可开始插入子项
   2. 如果 !firstIsLogic，不提前做插入，contentStart = null，
      到第一个 indent forItem 时不需要动 prevSibling，它就是 for.prevSibling
      到 dedent foritem 时 prevSibling = 上一项的 realAfter;
   3. realAfter 设置 
      dedent foritem 时  设置 forItem.realAfter = last.realAfter || last;

4. 更新渲染

   1. 新增
      1. 头部新增
         1. 如果 firstIsLogic ，先 contentStart 插入到 forNode.before 之后。
            然后从 contentStart 开始插入
         2. 非 firstIsLogic，从 forNode.before 开始插入
      2. 中间新增
         1. 如果  firstIsLogic 先 contentStart 插入到 前 item.realAfter 之后。
            然后从 contentStart 开始插入
         2. 非 firstIsLogic，从插入项的 realAfter 开始插入
      3. after 设置
         program eof 时插入完成， forItem(ctxProvider).realAfter = last.realAfter || last;
   2. 删除
      1. 头部删除
         从 forNode.before 开始删除真实 dom, forItem.xxx = undefined
      2. 中间删除
         从 前一项 after 开始删除真是 dom
   3. 移动
      1. 移到头部
         从 forNode.before 开始插入，插入dom是原节点前一节点 realAfter 到本节点 realAfter
      2. 移到中部
         从目标节点 after 开始插入，插入dom是原节点前一节点 realAfter 到本节点 realAfter

5. 有key更新渲染，使用 item.prev 增量字段

   1. 纯头增  原第一项.prev = 插入的最后一项
   2. 纯尾增  插入第一项.prev = 原最后一项
   3. 纯头删 删除最后一项的后一项.prev = null
   4. 纯尾删 不需要动
   5. 混合部分
      1. 中间区域删除 children[i+1]?.prev = children[i-1]
      2. 纯增删  item.prev =  children[i-1]； children[i]?.prev = item;
      3. 增删移
         1. 

