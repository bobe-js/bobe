/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { Router, createRouteRecord } from '../router';

function createMockComponent(text: string) {
  return class MockPage {
    text = text;
  } as any;
}

function makeRouter() {
  const map = {
    '/': createRouteRecord({ component: createMockComponent('home') }),
    '/about': createRouteRecord({ component: createMockComponent('about') }),
    '/post/:id': createRouteRecord({ component: createMockComponent('post') }),
  };
  return new Router({ routes: map });
}

describe('Router', () => {
  it('should init with a static path', async () => {
    const router = makeRouter();
    await router.ready();
    expect(router.active?.path).toBe('/');
  });

  it('should navigate with pushState', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');
    expect(router.active?.path).toBe('/about');
  });

  it('should navigate with replaceState', async () => {
    const router = makeRouter();
    await router.ready();
    await router.replaceState('/about');
    expect(router.active?.path).toBe('/about');
  });

  it('should match dynamic route params from init', async () => {
    const router = new Router({ routes: { '/post/:id': createRouteRecord({ component: createMockComponent('post') }) }, initialPath: '/post/42' });    await router.ready();
    expect(router.active?.path).toBe('/post/42');
    expect(router.active?.params).toEqual({ id: '42' });
  });

  it('should match dynamic route params from pushState', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/post/99');
    expect(router.active?.path).toBe('/post/99');
    expect(router.active?.params).toEqual({ id: '99' });
  });

  it('should skip navigation for unknown path', async () => {
    const router = makeRouter();
    await router.ready();
    const current = router.active?.path;
    await router.pushState('/no-such-route');
    expect(router.active?.path).toBe(current);
  });

  it('should create RouteRecord with meta', () => {
    const record = createRouteRecord({
      component: createMockComponent('test'),
      meta: { title: '测试', auth: true },
    });
    expect(record.meta).toEqual({ title: '测试', auth: true });
  });

  it('should create RouteRecord with layout', () => {
    const LayoutComp = createMockComponent('layout');
    const record = createRouteRecord({
      component: createMockComponent('test'),
      layout: LayoutComp,
    });
    expect(record.layout).toBe(LayoutComp);
  });

  it('should sync meta to active entry', async () => {
    const router = new Router({
      routes: {
        '/': createRouteRecord({ component: createMockComponent('home'), meta: { title: '首页' } }),
      },
      initialPath: '/',
    });
    await router.ready();
    expect(router.active?.meta).toEqual({ title: '首页' });
  });

  it('should extract layout from module named export', async () => {
    const LayoutComp = createMockComponent('layout');
    const PageComp = createMockComponent('page');

    const router = new Router({
      routes: {
        '/': createRouteRecord({
          import: () => Promise.resolve({ default: PageComp, layout: LayoutComp }),
        }),
      },
      initialPath: '/',
    });
    await router.ready();
    expect(router.routes['/']?.layout).toBe(LayoutComp);
  });

  it('should use module routeMeta as fallback when meta not set', async () => {
    const PageComp = createMockComponent('page');

    const router = new Router({
      routes: {
        '/': createRouteRecord({
          import: () => Promise.resolve({ default: PageComp, routeMeta: { title: '来自模块' } }),
        }),
      },
      initialPath: '/',
    });
    await router.ready();
    expect(router.routes['/']?.meta).toEqual({ title: '来自模块' });
  });

  it('should sync layout to active entry', async () => {
    const LayoutComp = createMockComponent('layout');

    const router = new Router({
      routes: {
        '/': createRouteRecord({ component: createMockComponent('home'), layout: LayoutComp }),
      },
      initialPath: '/',
    });
    await router.ready();
    expect(router.active?.layout).toBe(LayoutComp);
  });

  it('should keep explicit meta over module routeMeta fallback', async () => {
    const PageComp = createMockComponent('page');

    const router = new Router({
      routes: {
        '/': createRouteRecord({
          import: () => Promise.resolve({ default: PageComp, routeMeta: { title: '来自模块' } }),
          meta: { title: '显式设置' },
        }),
      },
      initialPath: '/',
    });
    await router.ready();
    expect(router.routes['/']?.meta).toEqual({ title: '显式设置' });
  });
});
