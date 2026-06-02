import { bobe, Store } from "bobe";
import { router } from "./router";
import MenuComp from "./components/menu";

export class App extends Store {
  router = router;
  ui = bobe`
    div
      ${MenuComp as any} name="导航" menus={router.menus}
      div
        {router.active.component}
  `;
}