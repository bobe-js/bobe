import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 "About (SSR)"
      p "Server-side rendered about page."
      a href="/" "Back to Home"
  `;
}
