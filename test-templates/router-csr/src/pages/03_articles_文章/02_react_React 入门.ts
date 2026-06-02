import { bobe, Store } from 'bobe';

export default class ReactArticle extends Store {
  ui = bobe`
    div
      h1 text="React 入门"
      p text="这是一篇 React 入门教程"
      a href="/articles" text="返回文章列表"
  `;
}
