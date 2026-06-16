/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
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
const waitForPopstate = () => new Promise<void>(resolve => {
  window.addEventListener('popstate', () => resolve(), { once: true });
});
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 10; i++) {
    if (predicate()) return;
    await tick();
  }
};

describe('Router', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    window.scrollTo = vi.fn();
  });

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

  it('should scroll to initial hash after the first render effect creates the target element', async () => {
    const target = document.createElement('section');
    target.id = 'intro';
    target.scrollIntoView = vi.fn();

    const router = new Router({
      routes: {
        '/about': createRouteRecord({ component: createMockComponent('about') }),
      },
      initialPath: '/about#intro',
    });

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    await router.ready();
    await tick();

    expect(document.querySelector('#intro')).toBe(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should scroll to hash after navigation render effects create the target element', async () => {
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

  it('should scroll on hash-only popstate for the current active route', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    const target = document.createElement('section');
    target.id = 'details';
    target.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    history.pushState(null, '', '/about#details');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should scroll to top when hash-only popstate clears the current hash', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    let scrollY = 640;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((_, y) => {
      scrollY = Number(y);
    });

    history.pushState(null, '', '/about#list');
    history.pushState(null, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('should scroll the configured scrollRootId element to top when hash-only popstate clears the current hash', async () => {
    const router = new Router({
      routes: {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/about': createRouteRecord({ component: createMockComponent('about') }),
      },
      scrollRootId: 'router-scroll-root',
    });
    await router.ready();
    await router.pushState('/about');

    const scrollRoot = document.createElement('main');
    scrollRoot.id = 'router-scroll-root';
    scrollRoot.scrollTop = 640;
    scrollRoot.scrollLeft = 32;
    document.body.appendChild(scrollRoot);

    history.pushState(null, '', '/about#list');
    history.pushState(null, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(scrollRoot.scrollTop).toBe(0);
    expect(scrollRoot.scrollLeft).toBe(0);
  });

  it('should scroll after external popstate resets active with a hash', async () => {
    const router = makeRouter();
    await router.ready();

    const target = document.createElement('section');
    target.id = 'external';
    target.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    history.pushState(null, '', '/about#external');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(document.querySelector('#external')).toBe(target);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('should load component when browser history and in-memory stack diverge after refresh', async () => {
    const Home = createMockComponent('home');
    const Article = createMockComponent('article');
    const loadHome = vi.fn(() => Promise.resolve({ default: Home }));

    history.pushState(null, '', '/');
    history.pushState(null, '', '/article');

    const router = new Router({
      routes: {
        '/': createRouteRecord({ import: loadHome }),
        '/article': createRouteRecord({ component: Article }),
      },
      initialPath: '/article',
    });
    await router.ready();

    const popstate = waitForPopstate();
    history.back();
    await popstate;
    await waitUntil(() => router.active?.path === '/');

    expect(router.active?.path).toBe('/');
    expect(router.active?.component).toBe(Home);
    expect(loadHome).toHaveBeenCalledTimes(1);
  });

  it('should delegate back to browser history when in-memory stack only has current entry', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    router['stack'] = [router.active!];
    router['stackIndex'] = 0;

    await router.back();

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('should restore scroll position when going back from a hash URL to the same route without hash', async () => {
    const router = makeRouter();
    await router.ready();

    const target = document.createElement('section');
    target.id = 'list';
    target.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    let scrollY = 0;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((_, y) => {
      scrollY = Number(y);
    });

    scrollY = 0;
    await router.pushState('/about');
    scrollY = 0;
    await router.pushState('/about#list');
    await tick();

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    scrollY = 640;
    const popstate = waitForPopstate();
    history.back();
    await popstate;
    await tick();
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('should restore scroll position on the configured scrollRootId element', async () => {
    const router = new Router({
      routes: {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/about': createRouteRecord({ component: createMockComponent('about') }),
      },
      scrollRootId: 'router-scroll-root',
    });
    await router.ready();

    const target = document.createElement('section');
    target.id = 'list';
    target.scrollIntoView = vi.fn();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    const scrollRoot = document.createElement('main');
    scrollRoot.id = 'router-scroll-root';
    document.body.appendChild(scrollRoot);

    scrollRoot.scrollTop = 0;
    await router.pushState('/about');
    scrollRoot.scrollTop = 0;
    await router.pushState('/about#list');
    await tick();

    scrollRoot.scrollTop = 640;
    const popstate = waitForPopstate();
    history.back();
    await popstate;
    await tick();
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(scrollRoot.scrollTop).toBe(0);
  });

  it('should set native history scroll restoration to manual in the browser', async () => {
    history.scrollRestoration = 'auto';

    const router = makeRouter();
    await router.ready();

    expect(router.active?.path).toBe('/');
    expect(history.scrollRestoration).toBe('manual');
  });
});
