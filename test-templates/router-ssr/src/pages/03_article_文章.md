# 标题一级

## 标题二级

### 标题三级

#### 标题四级

##### 标题五级

###### 标题六级

这是一段普通文本，包含**粗体**、*斜体*、~~删除线~~、`行内代码`。

## `<code src>` 文件引入

以下是 `app.ts` 及其依赖树，以 tab 展示：

<code src="../samples/todo-list.ts" preview />



---

## 文本样式

- **粗体文本** — `**粗体文本**`
- *斜体文本* — `*斜体文本*`
- ***粗斜体*** — `***粗斜体***`
- ~~删除线~~ — `~~删除线~~`
- `行内代码` — `` `行内代码` ``
- 上标<sup>2</sup>和下标<sub>2</sub> — `<sup>` / `<sub>`

---

## 列表

### 无序列表

- 项目 A
- 项目 B
  - 子项目 B-1
  - 子项目 B-2
    - 子子项目 B-2-a
- 项目 C

### 有序列表

1. 第一步
2. 第二步
   1. 子步骤 2.1
   2. 子步骤 2.2
3. 第三步

### 任务列表

- [x] 已完成任务
- [ ] 待办任务
- [ ] 另一项待办

---

## 引用

> 这是一段引用文本。
>
> 引用可以包含多个段落。

> 嵌套引用：
>
> > 这是二层引用。
> >
> > > 这是三层引用。

---

## 代码块

```javascript
// JavaScript 代码块
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
```

```typescript
// TypeScript 代码块
interface User {
  name: string;
  age: number;
}

const greet = (user: User): string => {
  return `Hello, ${user.name}! You are ${user.age} years old.`;
};
```

```css
/* CSS 代码块 */
.markdown-code {
  background: #f5f5f5;
  border-radius: 4px;
  padding: 16px;
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  line-height: 1.5;
  overflow-x: auto;
}
```

```html
<!-- HTML 代码块 -->
<div class="container">
  <h1>Hello World</h1>
  <p>This is a paragraph.</p>
</div>
```

```bash
# Shell 命令
git clone https://github.com/user/repo.git
cd repo && npm install
```

```python
# Python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[0]
    left = [x for x in arr[1:] if x < pivot]
    right = [x for x in arr[1:] if x >= pivot]
    return quick_sort(left) + [pivot] + quick_sort(right)
```

---

## 表格

| 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|
| 张三 | 28 | 前端工程师 | 北京 |
| 李四 | 32 | 后端工程师 | 上海 |
| 王五 | 25 | 设计师 | 深圳 |

### 对齐方式

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:-------:|-------:|
| 文本 | 文本 | 123 |
| abc | def | 456 |

---

## 链接与图片

[外部链接 — GitHub](https://github.com)

[内部锚点 — 跳到标题 1 级](#标题-1-级)

<https://www.example.com>

![图片占位](https://placehold.co/600x200/eee/999?text=Placeholder+Image)

---

## HTML 内嵌

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; background: #f9f9f9;">
  <strong>这是内嵌 HTML 块</strong>
  <p>Markdown 中的 HTML 标签可以正常工作。</p>
</div>

<details>
<summary>折叠面板（点击展开）</summary>

这是折叠的内容。支持任意 Markdown。

- 列表项
- 另一项

</details>

---

## 分割线

上面是分割线。

---

下面是分割线。

---

* * *

---

## 脚注

这是一个带脚注的句子。[^1]

另一个脚注引用。[^note]

[^1]: 这是脚注 1 的内容。
[^note]: 这是命名脚注的内容，可以写多段文字。

---

## 转义字符

\* 这不是斜体 \*

\` 这不是代码 \`

\# 这不是标题

---

