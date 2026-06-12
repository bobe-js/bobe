import { bobe, Store } from 'bobe';

export default class Home extends Store {
  ui = bobe`
    div
      h1 "Home (SSR)"
      p "Server-side rendered home page."
      a href="/about" "Go to About"
  `;
}
