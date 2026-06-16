/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effect } from 'aoye';
import { Router, createRouteRecord } from '../runtime';
import type { RouteMap } from '../type';

function createMockComponent(text: string) {
  return class MockPage {
    text = text;
  } as any;
}

function createDefaultRoutes(): RouteMap {
  return {
    '/': createRouteRecord({ component: createMockComponent('home') }),
    '/about': createRouteRecord({ component: createMockComponent('about') }),
    '/post/:id': createRouteRecord({ component: createMockComponent('post') }),
  };
}

function makeRouter(opt: Record<string, any> = {}, routes: RouteMap = createDefaultRoutes()) {
  return new Router({
    routes,
    ...opt,
  } as any);
}

function createHistoryState(historyKey: string, entryId: string, index: number, url: string) {
  return {
    __bobeRouter: true,
    historyKey,
    entryId,
    index,
    url,
  };
}

const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
const frame = () =>
  new Promise<void>(resolve => {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
const waitForPopstate = () =>
  new Promise<void>(resolve => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await tick();
  }
};

type TrackedGlobalListener = {
  target: Window | Document;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

let restoreGlobalListeners: (() => void) | null = null;

function cleanupGlobalListenerTracker() {
  restoreGlobalListeners?.();
  restoreGlobalListeners = null;
}

function installGlobalListenerTracker() {
  const tracked: TrackedGlobalListener[] = [];
  const originalWindowAdd = window.addEventListener;
  const originalWindowRemove = window.removeEventListener;
  const originalDocumentAdd = document.addEventListener;
  const originalDocumentRemove = document.removeEventListener;

  window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
    tracked.push({ target: window, type, listener, options });
    return originalWindowAdd.call(window, type, listener, options);
  }) as typeof window.addEventListener;

  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    tracked.push({ target: document, type, listener, options });
    return originalDocumentAdd.call(document, type, listener, options);
  }) as typeof document.addEventListener;

  restoreGlobalListeners = () => {
    for (let i = tracked.length - 1; i >= 0; i--) {
      const { target, type, listener, options } = tracked[i];
      if (target === window) {
        originalWindowRemove.call(window, type, listener, options);
      } else {
        originalDocumentRemove.call(document, type, listener, options);
      }
    }
    window.addEventListener = originalWindowAdd;
    window.removeEventListener = originalWindowRemove;
    document.addEventListener = originalDocumentAdd;
    document.removeEventListener = originalDocumentRemove;
  };
}

describe('runtime Router', () => {
  beforeEach(() => {
    cleanupGlobalListenerTracker();
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.useRealTimers();
    installGlobalListenerTracker();
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanupGlobalListenerTracker();
    vi.useRealTimers();
  });

  it('initializes and navigates with pushState', async () => {
    const router = makeRouter();
    await router.ready();

    await router.pushState('/about');

    expect(router.active?.path).toBe('/about');
    expect(history.state?.__bobeRouter).toBe(true);
    expect(history.state?.index).toBe(1);
  });

  it('runs ready callbacks queued before and after initialization', async () => {
    const router = makeRouter();
    const beforeReady = vi.fn();
    const afterReady = vi.fn();

    router.ready(beforeReady);
    expect(beforeReady).not.toHaveBeenCalled();

    await router.ready();
    expect(beforeReady).toHaveBeenCalledTimes(1);

    router.ready(afterReady);
    expect(afterReady).toHaveBeenCalledTimes(1);
  });

  it('initializes with dynamic params from initialPath', async () => {
    const router = makeRouter({ initialPath: '/post/42?tab=comments#reply' });

    await router.ready();

    expect(router.active?.path).toBe('/post/42');
    expect(router.active?.url).toBe('/post/42?tab=comments#reply');
    expect(router.active?.hash).toBe('#reply');
    expect(router.active?.params).toEqual({ id: '42' });
    expect(history.state?.url).toBe('/post/42?tab=comments#reply');
  });

  it('replaces the current entry without growing the router history index', async () => {
    const router = makeRouter();
    await router.ready();

    await router.pushState('/about');
    expect(history.state?.index).toBe(1);

    await router.replaceState('/post/7?mode=edit');

    expect(router.active?.path).toBe('/post/7');
    expect(router.active?.url).toBe('/post/7?mode=edit');
    expect(router.active?.params).toEqual({ id: '7' });
    expect(history.state?.index).toBe(1);
    expect(history.state?.url).toBe('/post/7?mode=edit');
  });

  it('ignores unknown routes without changing active or browser history state', async () => {
    const router = makeRouter();
    await router.ready();
    const active = router.active;
    const state = history.state;

    await router.pushState('/missing');

    expect(router.active).toBe(active);
    expect(history.state).toBe(state);
    expect(location.pathname).toBe('/');
  });

  it('ignores go(0)', async () => {
    const router = makeRouter();
    await router.ready();

    const goSpy = vi.spyOn(history, 'go');
    await router.go(0);

    expect(goSpy).not.toHaveBeenCalled();
    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);
  });

  it('preflights browser delta navigation and then lets popstate commit back and forward', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');
    await router.pushState('/post/2');

    const backPopstate = waitForPopstate();
    await router.go(-2);
    await backPopstate;
    await waitUntil(() => router.active?.path === '/');

    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);

    const forwardPopstate = waitForPopstate();
    await router.forward();
    await forwardPopstate;
    await waitUntil(() => router.active?.path === '/about');

    expect(router.active?.path).toBe('/about');
    expect(history.state?.index).toBe(1);
  });

  it('blocks navigation when a guard returns false', async () => {
    const router = makeRouter();
    await router.ready();

    const enterGuard = vi.fn(() => false);
    router.enterGuard = enterGuard;

    await router.pushState('/about');

    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/');
    expect(enterGuard).toHaveBeenCalledTimes(1);
  });

  it('redirects with replace semantics when a guard returns a redirect', async () => {
    const enterGuard = vi.fn(to => {
      if (to.path === '/about') return { ok: false, redirect: '/post/9' };
      return true;
    });
    const router = makeRouter({ enterGuard });
    await router.ready();

    await router.pushState('/about');

    expect(router.active?.path).toBe('/post/9');
    expect(router.active?.params).toEqual({ id: '9' });
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/post/9');
    expect(enterGuard.mock.calls.map(([to]) => to.path)).toEqual(['/', '/about', '/post/9']);
  });

  it('runs leave guard before enter guard and blocks when leave guard returns false', async () => {
    const router = makeRouter();
    await router.ready();

    const calls: string[] = [];
    router.leaveGuard = vi.fn(from => {
      calls.push(`leave:${from.path}`);
      return false;
    });
    router.enterGuard = vi.fn(to => {
      calls.push(`enter:${to.path}`);
      return true;
    });

    await router.pushState('/about');

    expect(router.active?.path).toBe('/');
    expect(history.state?.url).toBe('/');
    expect(calls).toEqual(['leave:/']);
    expect(router.enterGuard).not.toHaveBeenCalled();
  });

  it('does not call browser history.go when browser delta preflight is blocked', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    const goSpy = vi.spyOn(history, 'go');
    router.leaveGuard = vi.fn(() => false);

    await router.back();

    expect(goSpy).not.toHaveBeenCalled();
    expect(router.active?.path).toBe('/about');
    expect(history.state?.index).toBe(1);
  });

  it('syncs static meta and layout to the active entry', async () => {
    const Layout = createMockComponent('layout');
    const router = makeRouter(
      { initialPath: '/about' },
      {
        '/about': createRouteRecord({
          component: createMockComponent('about'),
          meta: { title: 'About' },
          layout: Layout,
        }),
      }
    );

    await router.ready();

    expect(router.active?.meta).toEqual({ title: 'About' });
    expect(router.active?.layout).toBe(Layout);
  });

  it('loads async route modules, syncs module exports, and reuses the cached component', async () => {
    const Page = createMockComponent('lazy');
    const Layout = createMockComponent('layout');
    const loadPage = vi.fn(() => Promise.resolve({ default: Page, routeMeta: { title: 'Lazy' }, layout: Layout }));
    const router = makeRouter(
      { maxPreload: 0 },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/lazy': createRouteRecord({ import: loadPage }),
      }
    );
    await router.ready();

    await router.pushState('/lazy');
    await router.replaceState('/lazy');

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(router.active?.component).toBe(Page);
    expect(router.active?.meta).toEqual({ title: 'Lazy' });
    expect(router.active?.layout).toBe(Layout);
    expect(router.routes['/lazy'].status).toBe('loaded');
  });

  it('preloads idle routes after navigation', async () => {
    const About = createMockComponent('about');
    const loadAbout = vi.fn(() => Promise.resolve({ default: About }));
    const router = makeRouter(
      { maxPreload: 1 },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/about': createRouteRecord({ import: loadAbout }),
      }
    );

    await router.ready();
    await frame();
    await waitUntil(() => router.routes['/about'].status === 'loaded');

    expect(loadAbout).toHaveBeenCalledTimes(1);
    expect(router.routes['/about'].component).toBe(About);
  });

  it('waits for the active render before scrolling to an initial hash', async () => {
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

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('waits for navigation render before scrolling to a hash', async () => {
    const target = document.createElement('section');
    target.id = 'details';
    target.scrollIntoView = vi.fn();
    const router = makeRouter();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    await router.ready();
    await router.pushState('/about#details');
    await tick();

    expect(router.active?.hash).toBe('#details');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('intercepts same-origin link clicks and ignores modified or external clicks', async () => {
    const router = makeRouter();
    await router.ready();

    const internal = document.createElement('a');
    internal.href = '/about';
    document.body.append(internal);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    internal.dispatchEvent(click);
    await waitUntil(() => router.active?.path === '/about');

    expect(click.defaultPrevented).toBe(true);
    expect(router.active?.path).toBe('/about');
    expect(history.state?.url).toBe('/about');

    const modified = document.createElement('a');
    modified.href = '/post/1';
    document.body.append(modified);
    const modifiedClick = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    modified.addEventListener('click', event => event.preventDefault());
    modified.dispatchEvent(modifiedClick);
    await tick();

    expect(modifiedClick.defaultPrevented).toBe(true);
    expect(router.active?.path).toBe('/about');

    const external = document.createElement('a');
    external.href = 'https://example.com/about';
    external.target = '_blank';
    document.body.append(external);
    const externalClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    external.dispatchEvent(externalClick);
    await tick();

    expect(externalClick.defaultPrevented).toBe(false);
    expect(router.active?.path).toBe('/about');
  });

  it('updates url and scrolls for hash-only link clicks on the active route', async () => {
    const target = document.createElement('section');
    target.id = 'list';
    target.scrollIntoView = vi.fn();
    document.body.append(target);

    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    const link = document.createElement('a');
    link.href = '/about#list';
    document.body.append(link);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    await tick();
    await frame();

    expect(click.defaultPrevented).toBe(true);
    expect(router.active?.path).toBe('/about');
    expect(router.active?.url).toBe('/about#list');
    expect(router.active?.hash).toBe('#list');
    expect(history.state?.index).toBe(1);
    expect(history.state?.url).toBe('/about#list');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('scrolls to top inside scrollRootId when hash-only popstate clears the hash', async () => {
    const root = document.createElement('main');
    root.id = 'router-scroll-root';
    root.scrollTop = 640;
    root.scrollLeft = 32;
    document.body.append(root);

    const router = makeRouter({ scrollRootId: 'router-scroll-root' });
    await router.ready();
    await router.pushState('/about');

    history.pushState(null, '', '/about#list');
    history.pushState(null, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(router.active?.hash).toBe('');
    expect(root.scrollTop).toBe(0);
    expect(root.scrollLeft).toBe(0);
  });

  it('handles external popstate by matching, replacing history state, and scrolling to hash', async () => {
    const target = document.createElement('section');
    target.id = 'external';
    target.scrollIntoView = vi.fn();
    const router = makeRouter();

    effect(() => {
      if (router.active?.path === '/about') {
        document.body.appendChild(target);
      }
    }, { type: 'render' });

    await router.ready();

    history.pushState(null, '', '/about#external');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitUntil(() => router.active?.path === '/about');
    await tick();
    await frame();

    expect(router.active?.path).toBe('/about');
    expect(history.state?.__bobeRouter).toBe(true);
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/about#external');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('restores scroll inside scrollRootId on back', async () => {
    const historyKey = 'scroll-root';
    const root = document.createElement('div');
    root.id = 'app';
    root.style.height = '100px';
    root.style.overflow = 'auto';
    document.body.append(root);

    history.replaceState(createHistoryState(historyKey, `${historyKey}:0`, 0, '/'), '', '/');

    const router = makeRouter(
      {
        historyKey,
        scrollRootId: 'app',
      },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/about': createRouteRecord({ component: createMockComponent('about') }),
      }
    );

    await router.ready();
    root.scrollTop = 120;

    await router.pushState('/about');
    expect(root.scrollTop).toBe(0);

    const popstate = new Promise<void>(resolve => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });

    await router.back();
    await popstate;
    await waitUntil(() => router.active?.path === '/' && root.scrollTop === 120);
    await tick();
    await tick();

    expect(router.active?.path).toBe('/');
    expect(root.scrollTop).toBe(120);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('recovers from history/state mismatch after refresh', async () => {
    const historyKey = 'refresh-key';
    history.replaceState(createHistoryState(historyKey, `${historyKey}:1`, 1, '/article'), '', '/article');

    const router = makeRouter(
      {
        historyKey,
      },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/article': createRouteRecord({ component: createMockComponent('article') }),
      }
    );

    await router.ready();
    expect(router.active?.path).toBe('/article');
    expect(history.state?.index).toBe(1);

    const popstate = new Promise<void>(resolve => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });

    await router.back();
    await popstate;
    await waitUntil(() => router.active?.path === '/' && history.state?.index === 0);

    expect(router.active?.path).toBe('/');
    expect(history.state?.__bobeRouter).toBe(true);
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/');
  });

  it('does not run guards again when back preflight is consumed by popstate', async () => {
    const router = makeRouter();
    await router.ready();
    await router.pushState('/about');

    const enterGuard = vi.fn(() => true);
    const leaveGuard = vi.fn(() => true);
    router.enterGuard = enterGuard;
    router.leaveGuard = leaveGuard;

    const popstate = new Promise<void>(resolve => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });

    await router.back();
    await popstate;
    await waitUntil(() => router.active?.path === '/');

    expect(router.active?.path).toBe('/');
    expect(leaveGuard).toHaveBeenCalledTimes(1);
    expect(enterGuard).toHaveBeenCalledTimes(1);
  });

  it('rolls back and reports when a guard throws', async () => {
    const error = new Error('guard failed');
    const onError = vi.fn();
    const router = makeRouter({ onError });
    await router.ready();

    router.enterGuard = vi.fn(() => {
      throw error;
    });

    await router.pushState('/about');

    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ status: 'error' }));
  });

  it('swallows errors thrown by onError after transaction rollback', async () => {
    const guardError = new Error('guard failed');
    const notifyError = new Error('notify failed');
    const onError = vi.fn(() => {
      throw notifyError;
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = makeRouter({ onError });
    await router.ready();

    router.enterGuard = vi.fn(() => {
      throw guardError;
    });

    await router.pushState('/about');

    expect(router.active?.path).toBe('/');
    expect(history.state?.url).toBe('/');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(notifyError);
  });

  it('rolls back and reports when a route import rejects', async () => {
    const error = new Error('import failed');
    const onError = vi.fn();
    const router = makeRouter(
      { onError, maxPreload: 0 },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/lazy': createRouteRecord({ import: vi.fn(() => Promise.reject(error)) }),
      }
    );
    await router.ready();

    await router.pushState('/lazy');

    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ status: 'error' }));
  });

  it('continues navigation when a route import times out and onTimeout returns continue', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn(() => 'continue' as const);
    let resolveImport: (mod: any) => void = () => {};
    const loadLazy = vi.fn(() => {
      return new Promise<any>(resolve => {
        resolveImport = value => {
          resolve(value);
        };
      });
    });
    const router = makeRouter(
      {
        loadTimeout: 10,
        onTimeout,
        maxPreload: 0,
      },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/lazy': createRouteRecord({ import: loadLazy }),
      }
    );
    await router.ready();

    const navigation = router.pushState('/lazy');
    await vi.advanceTimersByTimeAsync(10);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(router.active?.path).toBe('/');

    resolveImport({ default: createMockComponent('lazy') });
    await navigation;

    expect(router.active?.path).toBe('/lazy');
    expect(history.state?.index).toBe(1);
    expect(history.state?.url).toBe('/lazy');
  });

  it('cancels navigation when a route import times out and onTimeout returns cancel', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn(() => 'cancel' as const);
    const onError = vi.fn();
    const loadLazy = vi.fn(
      () => new Promise<any>(resolve => setTimeout(() => resolve({ default: createMockComponent('lazy') }), 50))
    );
    const router = makeRouter(
      {
        loadTimeout: 10,
        onTimeout,
        onError,
        maxPreload: 0,
      },
      {
        '/': createRouteRecord({ component: createMockComponent('home') }),
        '/lazy': createRouteRecord({ import: loadLazy }),
      }
    );
    await router.ready();

    const navigation = router.pushState('/lazy');
    await vi.advanceTimersByTimeAsync(10);
    await navigation;

    expect(router.active?.path).toBe('/');
    expect(history.state?.index).toBe(0);
    expect(history.state?.url).toBe('/');
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
  });

  it('rolls back browser history when a popstate guard throws', async () => {
    const error = new Error('popstate guard failed');
    const onError = vi.fn();
    const router = makeRouter({ onError });
    await router.ready();
    await router.pushState('/about');

    router.enterGuard = vi.fn(to => {
      if (to.path === '/') throw error;
      return true;
    });

    const rollbackPopstate = new Promise<void>(resolve => {
      let count = 0;
      const listener = () => {
        count++;
        if (count === 2) {
          window.removeEventListener('popstate', listener);
          resolve();
        }
      };
      window.addEventListener('popstate', listener);
    });

    history.back();
    await rollbackPopstate;
    await waitUntil(() => router.active?.path === '/about' && location.pathname === '/about');
    await tick();
    await tick();

    expect(router.active?.path).toBe('/about');
    expect(location.pathname).toBe('/about');
    expect(history.state?.index).toBe(1);
    expect(history.state?.url).toBe('/about');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ status: 'error' }));
  });
});
