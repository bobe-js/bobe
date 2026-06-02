import { bobe, Store } from 'bobe';

export default class Home extends Store {
  ui = bobe`
    div
      h1 text="Home (SSR)"
      p text="Server-side rendered home page."
      a href="/about" text="Go to About"
  `;
}
