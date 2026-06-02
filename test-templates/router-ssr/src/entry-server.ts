// SSR routes 由 bobe-router 插件的 transform 钩子注入到此文件顶部
import { Router } from 'bobe-router';
import { renderHtmlStr } from 'bobe-dom';

// 不静态 import App——Routes 注入在当前模块 body 执行，若 App 在 import 阶段加载
// 则 Router 构造先于 Routes 赋值 → active = null。动态 import 延迟到 render() 调用时，
// 此时 globalThis 已就绪
export async function render(url: string) {
  const { App } = await import('./app');
  const router = new Router({ initialPath: url });
  (globalThis as any).__SSR_ROUTER__ = router;
  await router.ready();
  const { html } = renderHtmlStr(App);
  return { html };
}
