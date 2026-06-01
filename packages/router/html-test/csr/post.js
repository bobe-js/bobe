import { bobe, Store } from 'bobe';

export default class Post extends Store {
  ui = bobe`
    div
      h1 text="文章页面"
      p text="这是一篇示例文章"
      a href="/" text="返回首页"
  `;
}
