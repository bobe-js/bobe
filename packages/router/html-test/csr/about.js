import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 "关于"
      p "这是关于页面"
      a href="/" "返回首页"
  `;
}
