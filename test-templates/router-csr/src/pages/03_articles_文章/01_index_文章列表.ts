import { bobe, Store } from 'bobe';

export default class Articles extends Store {
  ui = bobe`
    div
      h1 "文章列表"
      ul
        li 
          a href="/articles/react" "React 入门"
        li 
          a href="/articles/vue" "Vue 入门"
      a href="/" "返回首页"
  `;
}
