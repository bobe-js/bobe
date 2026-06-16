import { Store, StoreIgnoreKeys, effect } from 'aoye';
import type { RouteMap, RouteEntry, RouteRecord, GuardResult, Menu, RouterOptions } from './type';
import { match } from './match';
import { GlobalKey } from './global';

/** 创建带初始数据的 RouteRecord */
export function createRouteRecord(
  opts: Partial<Pick<RouteRecord, 'import' | 'component' | 'params' | 'meta' | 'layout'>> = {}
): RouteRecord {
  return {
    import: opts.import,
    component: opts.component,
    status: opts.component ? 'loaded' : 'idle',
    params: opts.params,
    meta: opts.meta,
    layout: opts.layout,
  };
}

export class Router extends Store {
  static [StoreIgnoreKeys] = ['routes', 'menus', 'stack', 'ready', 'scrollRootId'] as string[];

  /** 当前激活的路由，模板用 {active.component} 渲染 */
  active: RouteEntry | null = null;

  /** 路由表 */
  routes: RouteMap = {};

  /** 目录嵌套菜单 */
  menus: Menu[] = [];

  /** 进入守卫 */
  enterGuard?: (to: RouteEntry) => GuardResult | Promise<GuardResult>;

  /** 离开守卫 */
  leaveGuard?: (from: RouteEntry) => GuardResult | Promise<GuardResult>;

  /** 滚动容器 id；滚动时即时查找 DOM，以获取 active 渲染后的最新节点 */
  scrollRootId?: string;

  /** 历史栈（不响应式） */
  private stack: RouteEntry[] = [];
  private stackIndex = 0;

  /** 待预加载的路径集合 */
  private idleSet = new Set<string>();

  /** 最大并行预加载数 */
  maxPreload = 3;

  /** 当前正在加载的组件数 */
  private loadingCount = 0;

  /**
   * 注册首屏就绪回调。
   * - 已初始化 → 同步执行 cb
   * - 未初始化 → 入队，首屏加载完成后执行
   * 支持多次调用。
   * 无参数时返回 Promise。
   */
  ready(): Promise<void>;
  ready(cb: () => void): void;
  ready(cb?: () => void): Promise<void> | void {
    if (cb) {
      if (this.#inited) { cb(); }
      else { this.#readyQueue.push(cb); }
      return;
    }
    return new Promise<void>(resolve => this.ready(resolve));
  }

  #inited = false;
  #readyQueue: (() => void)[] = [];

  /** 触发纯 hash 滚动的响应式版本号 */
  private hashScrollVersion = 0;

  /** active 实际提交版本，用于丢弃过期 hash 滚动 */
  private activeCommitId = 0;

  /** 下一次渲染完成后待滚动的位置；hash 为空字符串时表示滚动到顶部 */
  #pendingHash: { hash: string; activeCommitId: number } | null = null;

  /** hash 滚动 watcher 的 dispose 句柄 */
  #hashEffect?: { dispose(): void };

  constructor(opt?: RouterOptions) {
    super();

    const routes = opt?.routes;
    const initialPath = opt?.initialPath;
    this.scrollRootId = opt?.scrollRootId;

    // 1. routes 优先级：用户传入 > SSR 注入 > 空
    this.routes = routes
      || (globalThis as any)[GlobalKey.Routes]
      || {};

    // 2. menus 优先级：SSR 注入 > 空
    const injectedMenus = (globalThis as any)[GlobalKey.Menus];
    if (injectedMenus) this.menus = injectedMenus;

    // 3. path 优先级：用户传入 > SSR 注入 > location > '/'
    const path = initialPath
      || (globalThis as any)[GlobalKey.Path]
      || (typeof location !== 'undefined' ? location.pathname + location.search + location.hash : '/');

    this.#init(path);
  }

  // ====== 初始化 ======
  async #init(path: string): Promise<void> {

    // 1. 初始化 idleSet（在加载首屏前，让预加载尽早启动）
    this.#initIdleSet();
    this.#initHashEffect();

    // 2. 首屏：匹配路由，已有 component 则跳过 load
    const result = match(path, this.routes);
    if (result) {
      const route = this.routes[result.path];

      if (route?.component) {
        // SSR 注入或构造函数传入的 component，直接复用
        route.status = 'loaded';
      } else {
        await this.#loadComponent(result.path);
      }

      const entry: RouteEntry = {
        path: result.url,
        params: result.params,
        component: route?.component,
        meta: route?.meta,
        layout: route?.layout,
      };
      this.#setActive(entry, this.#getHash(path));
    }

    this.stack = [{
      path: this.active?.path ?? '/',
      url: this.#getBrowserUrl(this.active?.path ?? '/', this.#getSearch(path), this.#getHash(path)),
      params: this.active?.params ?? {},
    }];
    this.stackIndex = 0;
    this.#initBrowser();

    // 就绪：执行所有排队回调
    this.#inited = true;
    const q = this.#readyQueue;
    this.#readyQueue = [];
    for (const cb of q) cb();
  }

  // ====== 浏览器初始化 ======

  #initBrowser(): void {
    if (typeof window === 'undefined') return;
    this.#initHashEffect();

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // 劫持容器内链接点击
    document.addEventListener('click', this.#onClick);

    // 浏览器前进/后退
    window.addEventListener('popstate', this.#onPopstate);

  }

  #initHashEffect(): void {
    if (typeof window === 'undefined' || this.#hashEffect) return;

    // hash 滚动 watcher：active 变更触发的 render effect 在 render 优先级队列中执行，
    // 本 watcher 注册为 post 优先级，保证在新页面 DOM 挂载之后才运行。
    // hashScrollVersion 只用于同一个 active 下的纯 hash popstate；hash 为空时滚到顶部。
    this.#hashEffect = effect(
      () => {
        const pending = this.#pendingHash;
        if (!pending) return;
        this.#pendingHash = null;
        if (pending.activeCommitId !== this.activeCommitId) return;
        if (!pending.hash) {
          this.#scrollTo(0);
          return;
        }
        const el = document.querySelector(decodeURIComponent(pending.hash));
        if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth' });
      },
      [() => this.active, () => this.hashScrollVersion],
      { type: 'post', immediate: false }
    );
  }

  #setActive(entry: RouteEntry, hash?: string | null): void {
    const activeCommitId = ++this.activeCommitId;
    this.#pendingHash = hash ? { hash, activeCommitId } : null;
    if (!entry.url) {
      entry.url = this.#getBrowserUrl(entry.path, this.#getSearch(entry.path), hash || '');
    }
    this.active = entry;
  }

  #setPendingHash(hash: string | null | undefined, trigger = false): void {
    if (hash == null && !trigger) {
      this.#pendingHash = null;
      return;
    }
    this.#pendingHash = {
      hash: hash || '',
      activeCommitId: this.activeCommitId,
    };
    if (trigger) this.hashScrollVersion++;
  }

  #getHash(url: string): string {
    try {
      const base = typeof location !== 'undefined' ? location.origin : 'http://localhost';
      return new URL(url, base).hash;
    } catch {
      return '';
    }
  }

  #getSearch(url: string): string {
    try {
      const base = typeof location !== 'undefined' ? location.origin : 'http://localhost';
      return new URL(url, base).search;
    } catch {
      return '';
    }
  }

  #getBrowserUrl(path: string, search = '', hash = ''): string {
    return path + search + hash;
  }

  #initIdleSet(): void {
    for (const path of Object.keys(this.routes)) {
      if (this.routes[path].status === 'idle') {
        this.idleSet.add(path);
      }
    }
    // 移除首屏路径
    if (this.active) {
      this.idleSet.delete(this.active.path);
    }
  }

  // ====== 五个公开方法 ======

  /** 导航到新页面（追加历史记录） */
  async pushState(url: string): Promise<void> {
    const result = match(url, this.routes);
    if (!result) return;

    // 从原始 URL 中提取 search 和 hash（match 已将其剥离，此处保留到浏览器 URL）
    const parsed = new URL(url, location.origin);
    const target: RouteEntry = {
      path: result.url,
      url: this.#getBrowserUrl(result.url, parsed.search, parsed.hash),
      params: result.params,
    };
    const prevStackIndex = this.stackIndex;
    // 截断当前位置之后的历史，再追加
    this.stack.length = this.stackIndex + 1;
    this.stack.push(target);
    this.stackIndex = this.stack.length - 1;
    await this.#navigate(target, {
      pattern: result.path,
      search: parsed.search,
      hash: parsed.hash,
      saveScrollIndex: prevStackIndex,
    });
  }

  /** 替换当前页面（不追加历史记录） */
  async replaceState(url: string): Promise<void> {
    const result = match(url, this.routes);
    if (!result) return;

    const parsed = new URL(url, location.origin);
    const target: RouteEntry = {
      path: result.url,
      url: this.#getBrowserUrl(result.url, parsed.search, parsed.hash),
      params: result.params,
    };
    this.stack[this.stackIndex] = target;
    await this.#navigate(target, {
      replace: true,
      pattern: result.path,
      search: parsed.search,
      hash: parsed.hash,
      saveScrollIndex: false,
    });
  }

  /** 后退 */
  async back(): Promise<void> {
    if (!(await this.#checkGuard(this.active!, 'leave'))) return;
    if (this.stackIndex <= 0) {
      history.back();
      return;
    }

    const target = this.stack[this.stackIndex - 1];
    if (!(await this.#checkGuard(target, 'enter'))) return;

    history.back(); // popstate 触发 Index 同步
  }

  /** 前进 */
  async forward(): Promise<void> {
    if (this.stackIndex >= this.stack.length - 1) return;
    if (!(await this.#checkGuard(this.active!, 'leave'))) return;

    const target = this.stack[this.stackIndex + 1];
    if (!(await this.#checkGuard(target, 'enter'))) return;

    history.forward(); // popstate 触发 Index 同步
  }

  /** 跳转多步 */
  async go(delta: number): Promise<void> {
    if (delta === 0) return;
    const newIdx = this.stackIndex + delta;
    if (newIdx < 0 || newIdx >= this.stack.length) return;

    if (!(await this.#checkGuard(this.active!, 'leave'))) return;
    if (!(await this.#checkGuard(this.stack[newIdx], 'enter'))) return;

    history.go(delta);
  }

  // ====== 内部实现 ======

  private navId = 0;

  async #navigate(
    target: RouteEntry,
    opts: {
      replace?: boolean;
      pattern?: string;
      search?: string;
      hash?: string;
      saveScrollIndex?: number | false;
    } = {}
  ): Promise<void> {
    const id = ++this.navId;
    const lookupKey = opts.pattern || target.path;
    const browserUrl = target.path + (opts.search || '') + (opts.hash || '');

    if (!(await this.#checkGuard(this.active!, 'leave'))) return;
    if (id !== this.navId) return; // 守卫期间有新导航，丢弃本次
    if (!(await this.#checkGuard(target, 'enter'))) return;
    if (id !== this.navId) return;

    // 保存当前页滚动位置
    if (opts.saveScrollIndex !== false) {
      this.#saveScroll(opts.saveScrollIndex ?? this.stackIndex);
    }

    if (!opts.replace) {
      history.pushState(null, '', browserUrl);
    } else {
      history.replaceState(null, '', browserUrl);
    }

    // 加载组件（用路由模式查找 import 函数）
    await this.#loadComponent(lookupKey);
    if (id !== this.navId) return; // 加载期间有新导航，丢弃本次

    const route = this.routes[lookupKey];
    target.component = route?.component;
    target.meta = route?.meta;
    target.layout = route?.layout;

    // 标记待滚动 hash，再切换 active；
    // active 的 render effect 渲染完新页面后，post 优先级的 #hashEffect 会读取并滚动。
    this.#setActive(target, opts.hash);

    this.#preloadNext();
  }

  #saveScroll(index: number): void {
    if (this.active && this.stack[index]) {
      this.stack[index].scroll = this.#getScrollTop();
    }
  }

  #getScrollElement(): HTMLElement | null {
    if (!this.scrollRootId || typeof document === 'undefined') return null;
    return document.getElementById(this.scrollRootId);
  }

  #getScrollTop(): number {
    const el = this.#getScrollElement();
    if (el) return el.scrollTop;
    return window.scrollY;
  }

  #scrollTo(top: number): void {
    const el = this.#getScrollElement();
    if (el) {
      el.scrollTop = top;
      el.scrollLeft = 0;
      return;
    }
    window.scrollTo(0, top);
  }

  async #checkGuard(
    entry: RouteEntry,
    type: 'enter' | 'leave'
  ): Promise<boolean> {
    if (type === 'enter' && this.enterGuard) {
      const result = await this.enterGuard(entry);
      if (result === false) return false;
      if (typeof result === 'object' && !result.ok) return false;
    }
    if (type === 'leave' && this.leaveGuard) {
      const result = await this.leaveGuard(entry);
      if (result === false) return false;
      if (typeof result === 'object' && !result.ok) return false;
    }
    return true;
  }

  // ====== 组件异步加载 ======

  async #loadComponent(path: string): Promise<any> {
    const route = this.routes[path];
    if (!route) return undefined;

    switch (route.status) {
      case 'loaded':
        return route.component;
      case 'loading':
        return route.promise;
      case 'error':
        break; // 可重试
      case 'idle':
        break;
    }

    if (!route.import) {
      throw new Error(`Route "${path}" has no import function`);
    }

    this.idleSet.delete(path);
    route.status = 'loading';
    route.promise = route
      .import()
      .then((mod: any) => {
        const Comp = mod.default || mod;
        route.status = 'loaded';
        route.component = Comp;
        // 从模块 named export 提取 routeMeta（构建时未提取到时的回退）
        if (!route.meta && mod.routeMeta) {
          route.meta = mod.routeMeta;
        }
        // 从模块 named export 提取 layout（若未显式设置）
        if (!route.layout && mod.layout) {
          route.layout = mod.layout;
        }
        return route.component;
      })
      .catch((err) => {
        route.status = 'error';
        throw err;
      })
      .finally(() => {
        this.loadingCount--;
        this.#preloadNext();
      });

    return route.promise;
  }

  // ====== 空闲预加载 ======

  #preloadNext(): void {
    while (this.loadingCount < this.maxPreload && this.idleSet.size > 0) {
      const path = this.idleSet.values().next().value!;
      this.loadingCount++;
      const scheduler =
        typeof requestIdleCallback !== 'undefined'
          ? requestIdleCallback
          : (fn: () => void) => setTimeout(fn, 0);
      scheduler(() => {
        this.#loadComponent(path);
      });
    }
  }

  // ====== 链接劫持 ======

  #onClick = (e: MouseEvent): void => {
    const link = (e.target as Element).closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // 纯 hash 链接放行，浏览器原生处理滚动
    if (href.startsWith('#')) return;

    try {
      const url = new URL(href, location.origin);
      // 外部链接不拦截
      if (url.origin !== location.origin) return;
      // 新窗口、下载、快捷键不拦截
      if (link.target === '_blank') return;
      if (link.hasAttribute('download')) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      e.preventDefault();
      this.pushState(url.pathname + url.search + url.hash);
    } catch {
      // 无效 URL，不拦截
    }
  };

  // ====== popstate 回调 ======

  #onPopstate = (): void => {
    void this.#handlePopstate();
  };

  async #handlePopstate(): Promise<void> {
    const current = location.pathname + location.search + location.hash;
    const result = match(current, this.routes);
    const normalized = result?.url || current;
    const idx = this.stack.findLastIndex((r) => (r.url ?? r.path) === current);

    if (idx === -1 && this.active?.path === normalized) {
      this.#setPendingHash(location.hash, true);
      return;
    }

    if (idx !== -1) {
      // 仅 hash 变化，浏览器已更新 URL；Router 仍需要在 post 队列里等异步 DOM。
      if (idx === this.stackIndex) {
        this.#setPendingHash(location.hash, true);
        return;
      }
      // 在栈中 → Router 产生的历史，移动指针
      this.#saveScroll(this.stackIndex);
      this.stackIndex = idx;
      const entry = this.stack[idx];
      this.#navigate(entry, {
        replace: true,
        pattern: result?.path,
        hash: location.hash,
        search: location.search,
        saveScrollIndex: false,
      }).then(() => {
        // 恢复滚动位置
        if (entry.scroll != null) {
          this.#scrollTo(entry.scroll);
        }
      });
    } else {
      // 不在栈中 → 外部跳转，重置栈
      const route = result ? this.routes[result.path] : undefined;
      if (result && route && !route.component && route.import) {
        await this.#loadComponent(result.path);
      }
      const entry: RouteEntry = {
        path: normalized,
        url: current,
        params: result?.params ?? {},
        component: route?.component,
        meta: route?.meta,
        layout: route?.layout,
      };
      this.stack = [entry];
      this.stackIndex = 0;
      this.#setActive(entry, location.hash);
    }
  }
}
