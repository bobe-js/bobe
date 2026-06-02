import { bobe, Store } from 'bobe';

export default class Articles extends Store {
  ui = bobe`
    div
      h1 text="文章列表"
      ul
        li 
          a href="/articles/react" text="React 入门"
        li 
          a href="/articles/vue" text="Vue 入门"
      a href="/" text="返回首页"
  `;
}
