import { bobe, Store } from 'bobe';

export default class Home extends Store {
  ui = bobe`
    div
      h1 text="Home"
      p text="Welcome to home page!"
      a href="/about" text="Go to About"
  `;
}
