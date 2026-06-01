import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 text="关于"
      p text="这是关于页面"
      a href="/" text="返回首页"
  `;
}
