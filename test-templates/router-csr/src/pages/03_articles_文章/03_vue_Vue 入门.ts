import { bobe, Store } from 'bobe';

export default class VueArticle extends Store {
  ui = bobe`
    div
      h1 text="Vue 入门"
      p text="这是一篇 Vue 入门教程"
      a href="/articles" text="返回文章列表"
  `;
}
