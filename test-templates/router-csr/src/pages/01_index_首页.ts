import { bobe, Store } from 'bobe';
import MyLayout from '../layout/my-layout';

export default class Home extends Store {
  ui = bobe`
    div
      h1 text="Home"
      p text="Welcome to home page!"
      a href="/about" text="Go to About"
  `;
}

export const routeMeta = {
  title: 'Home',
}

export const layout = MyLayout;