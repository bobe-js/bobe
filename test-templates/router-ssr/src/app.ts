import { bobe, Store } from "bobe";
import { router } from "./router";
import Layout from "./layout/default";
import { NotFound } from "./components/not-found";
export class App extends Store {
  router = (globalThis as any).__SSR_ROUTER__ || router;
  defaultLayout = Layout;
  notFound = NotFound;
  ui = bobe`    
    {router.active?.layout || defaultLayout}
    | menus={router.menus}
    | activePath={router.active?.path}
      {router.active?.component || notFound} showAside=true
  `;
}
