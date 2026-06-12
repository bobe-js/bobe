import { bobe, Store } from 'bobe';

export default class ReactArticle extends Store {
  ui = bobe`
    div
      h1 "React 入门"
      p "这是一篇 React 入门教程"
      a href="/articles" "返回文章列表"
  `;
}
