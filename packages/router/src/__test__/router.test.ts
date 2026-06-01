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
  return new Router(map);
}

describe('Router', () => {
  it('should init with a static path', async () => {
    const router = makeRouter();
    await router.ready;
    expect(router.active?.path).toBe('/');
  });

  it('should navigate with pushState', async () => {
    const router = makeRouter();
    await router.ready;
    await router.pushState('/about');
    expect(router.active?.path).toBe('/about');
  });

  it('should navigate with replaceState', async () => {
    const router = makeRouter();
    await router.ready;
    await router.replaceState('/about');
    expect(router.active?.path).toBe('/about');
  });

  it('should match dynamic route params from init', async () => {
    const router = new Router(
      {
        '/post/:id': createRouteRecord({ component: createMockComponent('post') }),
      },
      '/post/42'
    );
    await router.ready;
    expect(router.active?.path).toBe('/post/42');
    expect(router.active?.params).toEqual({ id: '42' });
  });

  it('should match dynamic route params from pushState', async () => {
    const router = makeRouter();
    await router.ready;
    await router.pushState('/post/99');
    expect(router.active?.path).toBe('/post/99');
    expect(router.active?.params).toEqual({ id: '99' });
  });

  it('should skip navigation for unknown path', async () => {
    const router = makeRouter();
    await router.ready;
    const current = router.active?.path;
    await router.pushState('/no-such-route');
    expect(router.active?.path).toBe(current);
  });
});
