import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 text="About"
      p text="This is the about page."
      a href="/" text="Back to Home"
  `;
}
