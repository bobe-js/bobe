/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { effect } from 'aoye';
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

const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

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

  it('should scroll to hash after render effects create the target element', async () => {
    const router = makeRouter();
    await router.ready();

    const target = document.createElement('section');
    target.id = 'intro';
    target.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    expect(document.querySelector('#intro')).toBeNull();

    await router.pushState('/about#intro');
    await tick();

    expect(document.querySelector('#intro')).toBe(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should ignore stale hash scroll effects after a newer navigation', async () => {
    const router = makeRouter();
    await router.ready();

    const intro = document.createElement('section');
    intro.id = 'intro';
    intro.scrollIntoView = vi.fn();

    const latest = document.createElement('section');
    latest.id = 'latest';
    latest.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(intro);
      }
      if (router.active?.path === '/post/1') {
        document.body.appendChild(latest);
      }
    }, { type: 'render' });

    const first = router.pushState('/about#intro');
    const second = router.pushState('/post/1#latest');

    await first;
    await second;
    await tick();

    expect(intro.scrollIntoView).not.toHaveBeenCalled();
    expect(latest.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(latest.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });
});
