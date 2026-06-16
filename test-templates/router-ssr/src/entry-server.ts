// SSR routes 由 bobe-router 插件的 transform 钩子注入到此文件顶部
import { Router } from 'bobe-router';
import { renderHtmlStr } from 'bobe-dom/ssr';
import { routerScrollRootId } from './router';
import { App } from './app';

export async function render(url: string) {
  const ssrRouter = new Router({ initialPath: url, scrollRootId: routerScrollRootId });
  await ssrRouter.ready();
  class RequestApp extends App {
    router = ssrRouter;
  }
  const html = renderHtmlStr(RequestApp);
  return html;
}
