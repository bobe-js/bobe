import { bobe, Store } from "bobe";

export class NotFound extends Store {
  ui = bobe`
    h1 "404" style="margin: auto;"
  `;
}
