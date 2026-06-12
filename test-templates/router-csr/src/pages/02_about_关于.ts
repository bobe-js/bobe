import { bobe, Store } from 'bobe';

export default class About extends Store {
  ui = bobe`
    div
      h1 "About"
      p "This is the about page."
      a href="/" "Back to Home"
  `;
}
