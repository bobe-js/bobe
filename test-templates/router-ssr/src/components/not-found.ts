import { bobe, Store } from "bobe";

export class NotFound extends Store {
  ui = bobe`
    h1 text="404" style="margin: auto;"
  `;
}
