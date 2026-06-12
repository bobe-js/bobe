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
    div class="todo-app" style="max-width: 500px; margin: 0 auto;"
      h1 "📋 TODO List"

      // ---- 输入区域 ----
      div class="todo-input" style="display: flex; gap: 8px; margin-bottom: 16px;"
        input
        | value={newText}
        | oninput={(e) => newText = e.target.value }
        | type="text"
        | placeholder="What needs to be done?"
        | onkeydown={(e) => { if (e.key === 'Enter') addTodo() }}
        | style="flex: 1; padding: 8px 12px; border: 1px solid #d0d7de; border-radius: 6px;"
        button
        | "Add"
        | onclick={() => addTodo()}
        | style="padding: 8px 16px; background: #2da44e; color: #fff; border: none; border-radius: 6px; cursor: pointer;"

      // ---- 空状态 ----
      if todos.length === 0
        p
        | "No todos yet. Add one above!"
        | style="color: #9198a1; text-align: center; padding: 24px 0;"

      // ---- TODO 列表 ----
      ul style="list-style: none; padding: 0;"
        for todos; todo i; todo.id
          li class={todo.completed ? 'todo-item completed' : 'todo-item'}
          | style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #eaeef2;"
            input
            | type="checkbox"
            | checked={todo.completed}
            | onchange={() => toggleTodo(i)}
            span
            | {todo.text}
            | style={todo.completed ? 'text-decoration: line-through; color: #9198a1; flex: 1;' : 'flex: 1;'}
            button
            | "×"
            | onclick={() => removeTodo(todo.id)}
            | style="background: none; border: none; color: #cf222e; font-size: 18px; cursor: pointer;"

      // ---- 统计栏 ----
      div style="margin-top: 12px; padding: 8px 0; color: #57606a; font-size: 13px; border-top: 1px solid #eaeef2;"
        span {activeCount + ' left'}
  `;
}

export default TodoApp;
