import { bobe, Store } from "bobe";

export class NotFound extends Store {
  ui = bobe`
    h1 class="text-8xl w-full text-center"
      "404"   
  `;
}
