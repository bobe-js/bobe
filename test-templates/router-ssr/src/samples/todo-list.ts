import { fib }  from './fib'
import { bobe, Store } from 'bobe';

fib(10);

class TodoApp extends Store {
  todos = [
    { id: 1, text: 'Learn bobe DSL', completed: true },
    { id: 2, text: 'Build a TODO app', completed: false },
    { id: 3, text: 'Add highlight.js support', completed: false },
  ];
  newText = '';
  nextId = 4;

  addTodo() {
    if (!this.newText.trim()) return;
    this.todos.push({ id: this.nextId++, text: this.newText, completed: false });
    this.newText = '';
  }

  toggleTodo(i: number) {
    const completed = this.todos[i].completed;
    this.todos[i].completed = !completed;
  }

  removeTodo(id: number) {
    this.todos = this.todos.filter((t) => t.id !== id);
  }

  get activeCount() {
    return this.todos.filter((t) => !t.completed).length;
  }

  ui = bobe`
    div class="max-w-xl mx-auto p-6"
      h1 class="text-2xl font-bold mb-6" "📋 TODO List"

      // ---- 输入区域 ----
      div class="flex gap-2 mb-4"
        input
        | value={newText}
        | oninput={(e) => newText = e.target.value }
        | type="text"
        | placeholder="What needs to be done?"
        | onkeydown={(e) => { if (e.key === 'Enter') addTodo() }}
        | class="flex-1 px-3 py-2 border border-[#d0d7de] rounded-md outline-none focus:border-[#2da44e]"
        button
        | "Add"
        | onclick={() => addTodo()}
        | class="px-4 py-2 bg-[#2da44e] text-white rounded-md cursor-pointer hover:bg-[#2c974b]"

      // ---- 空状态 ----
      if todos.length === 0
        p class="text-[#9198a1] text-center py-6"
        | "No todos yet. Add one above!"

      // ---- TODO 列表 ----
      ul class="list-none p-0! border border-[#eaeef2] rounded-md"
        for todos; todo i; todo.id
          li class={todo.completed ? 'flex items-center gap-2.5 px-3 py-2.5 border-b border-[#eaeef2] last:border-b-0' : 'flex items-center gap-2.5 px-3 py-2.5 border-b border-[#eaeef2] last:border-b-0'}
            input
            | type="checkbox"
            | checked={todo.completed}
            | onchange={() => toggleTodo(i)}
            span
            | {todo.text}
            | class={todo.completed ? 'line-through text-[#9198a1] flex-1' : 'flex-1'}
            button
            | "×"
            | onclick={() => removeTodo(todo.id)}
            | class="bg-transparent border-none text-[#cf222e] text-lg cursor-pointer hover:text-red-800"

      // ---- 统计栏 ----
      div class="mt-3 py-2 text-[#57606a] text-[13px] border-t border-[#eaeef2]"
        span {activeCount + ' left'}
  `;
}

export default TodoApp;
