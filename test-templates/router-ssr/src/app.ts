import { bobe, Store } from "bobe";
import { router } from "./router";
import MenuComp from "./components/menu";

export class App extends Store {
  router = (globalThis as any).__SSR_ROUTER__ || router;
  ui = bobe`
    div
      ${MenuComp} name="导航" menus={router.menus}
      div
        {router.active.component} showAside=true
  `;
}
