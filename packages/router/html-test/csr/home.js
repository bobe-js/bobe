import { bobe, Store } from 'bobe';

export default class Home extends Store {
  ui = bobe`
    div
      h1 "首页"
      p "欢迎来到 Bobe Router CSR 测试"
      a href="/about" "前往关于页面"
  `;
}
