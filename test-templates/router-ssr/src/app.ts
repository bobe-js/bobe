import { bobe, Store } from "bobe";
import { router } from "./router";
import Layout from "./layout/default";
import { NotFound } from "./components/not-found";
import { DropDown } from "./components/drop-down";
export class App extends Store {
  router = (globalThis as any).__SSR_ROUTER__ || router;
  defaultLayout = Layout;
  notFound = NotFound;
  ui = bobe`
    div
      ${DropDown} auto=true  bordered=false items={[
        { text: 'Option 1' },
        { text: 'Option 2' },
        { text: 'Option 3' },
      ]} 
    {router.active?.layout || defaultLayout} menus={router.menus}
      {router.active?.component || notFound}        
  `;
}
