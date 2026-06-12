import { bobe, Store } from 'bobe';

export default class Post extends Store {
  ui = bobe`
    div
      h1 "文章页面"
      p "这是一篇示例文章"
      a href="/" "返回首页"
  `;
}
