import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 text="About (SSR)"
      p text="Server-side rendered about page."
      a href="/" text="Back to Home"
  `;
}
