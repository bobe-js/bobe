<!-- TODO: 跟新文档 -->
## if 节点

首屏

1. 如果条件是 true ，
   1. `exit` 收集到 directList
   1. `exit` 将 realList 挂到父节点上
2. 如果条件是 false，
   1. `enter` token skip 跳过并将 skip string 保存在 if 节点中
3. 公共逻辑
   1. `enter`   snapshot 保存当前 token 位置
   2. watch 执行重新渲染逻辑

重新渲染

1. true -> false 递归删除 if 下 directList 指定的 节点
2. false -> true  恢复 `tokenizer` 



如果子 if 被父 if 删除了，那么父 if 要重新解析来生成了

```yaml
gp
	if ${() => false} // [a,b]
		a
		b
	if ${() => true} // [c,d,if]
		c
		d
		if ${() => true} // [e]
			e
abc
```

