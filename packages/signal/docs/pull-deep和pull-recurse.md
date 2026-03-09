```
孙 子 父 爷


1. 爷.pullDeep 找到修改源 孙 Dirty
2. 标记子节点 Dirty，设置 孙=clean
3. 子.pullRecurse 此时 不重新建立 子->父
4. 孙子已建立 依赖
5. 子调用 pullRecurse 时，孙根据 pull 是 PULL_DEFAULT 执行 孙 pullRecurse 此时复用依赖
6. 子 pullRecurse 后，发现需要更新，标记父 Dirty，子=clean
7. 父.pullRecurse 此时 不重新建立 父->爷
8. 孙子已建立 依赖
9. 父.pullRecurse 时，子执行 pullDeep，子是 clean，
   此时父 recEnd=null，而子 pullDeep 无法建立 子 -> 父连接 
```

