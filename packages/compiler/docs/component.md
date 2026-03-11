data、props 声明和使用

```ts
class DebounceStore extends Store<> {
  raw: T;
  value: T;
}

const a = 10;

class Component extends Store {
  a = 10;
  debounced = DebounceStore.new({ raw: 'a' })
  
  ui = bobe`
  	div textContent={a}
  	div textContent={'debounced:' + debounced}
  `
}

const a = '123'
// abc
new DebounceStore()

function bobe(fragments: TemplateStringsArray, ...values: any[]) {
  return function(option) {
    const that = this;
    // 解析 fragments，values
    // 碰到
    const tokenizer = new Tokenizer();
  	const itp = new Terp(tokenizer);

    itp.config(option);
    itp.init();
    const treeList = itp.program();
    
    return treeList;
    // 碰到 prop={ 生成 如下函数
		const fn = new Function('that', `with(that){${ userCode }}`);
  }
}
// render -> options
function customRender(option) {
  // 保存 options
	function render(Ctor: new () => Store) {
		const ins = Ctor.new();
    const treeList = ins.ui(option);
	}
}


// 首屏 渲染执行流程
// 1. render
// 2. const ins = App.new()
// 3. return ins.ui => program;
// 		3.1 bobe
// 		3.2 const terp = new Interpreter()
// 		3.3 const componentNode = terp.program()  // 此节点需要考虑 after，其余节点 after = null
// 				3.3.1 Component 节点
//        3.3.2 const ins = Component.new()
// 				... 递归执行 3.
//        3.3.3 将 component 所有子节点挂载到 realParent 上


// 逻辑节点 before 是 逻辑节点，before = anchor
// 逻辑节点 前面是 普通节点，before = before
// 普通节点 前面是 逻辑节点，before  = anchor
```

