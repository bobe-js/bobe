import { Store, StoreIgnoreKeys } from 'aoye';
import type { RouteMap, RouteEntry, RouteRecord, GuardResult, Menu } from './type';
import { match } from './match';

/** 创建带初始数据的 RouteRecord */
export function createRouteRecord(
  opts: Partial<Pick<RouteRecord, 'import' | 'component' | 'params'>> = {}
): RouteRecord {
  return {
    import: opts.import,
    component: opts.component,
    status: opts.component ? 'loaded' : 'idle',
    params: opts.params,
  };
}

export class Router extends Store {
  static [StoreIgnoreKeys] = ['routes', 'menus', 'stack', 'ready'] as string[];

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
   */
  ready(cb: () => void): void;

  ready(cb: () => void): void {
    if (this.#inited) {
      cb();
    } else {
      this.#readyQueue.push(cb);
    }
  }

  #inited = false;
  #readyQueue: (() => void)[] = [];

  constructor(routes?: RouteMap, initialPath?: string) {
    super();

    // 1. routes 优先级：SSR 注入 > 用户传入 > 空
    this.routes = (globalThis as any).__BOBE_INIT_ROUTES__
      || routes
      || {};

    // 2. path 优先级：SSR 注入 > 用户传入 > location > '/'
    const path = (globalThis as any).__BOBE_INIT_PATH__
      || initialPath
      || (typeof location !== 'undefined' ? location.pathname : '/');

    this.#init(path);
  }

  // ====== 初始化 ======
  async #init(path: string): Promise<void> {

    // 1. 初始化 idleSet（在加载首屏前，让预加载尽早启动）
    this.#initIdleSet();

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

      this.active = {
        path,
        params: result.params,
        component: route?.component,
      };
    }

    this.stack = [{ path, params: this.active?.params ?? {} }];
    this.stackIndex = 0;
    this.#initBrowser();

    // 3. 就绪：同步执行所有排队回调
    this.#inited = true;
    const q = this.#readyQueue;
    this.#readyQueue = [];
    for (const cb of q) cb();
  }

  // ====== 浏览器初始化 ======

  #initBrowser(): void {
    if (typeof window === 'undefined') return;

    // 劫持容器内链接点击
    document.addEventListener('click', this.#onClick);

    // 浏览器前进/后退
    window.addEventListener('popstate', this.#onPopstate);
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

    const target: RouteEntry = { path: url, params: result.params };
    // 截断当前位置之后的历史，再追加
    this.stack.length = this.stackIndex + 1;
    this.stack.push(target);
    this.stackIndex = this.stack.length - 1;
    await this.#navigate(target);
  }

  /** 替换当前页面（不追加历史记录） */
  async replaceState(url: string): Promise<void> {
    const result = match(url, this.routes);
    if (!result) return;

    const target: RouteEntry = { path: url, params: result.params };
    this.stack[this.stackIndex] = target;
    await this.#navigate(target, { replace: true });
  }

  /** 后退 */
  async back(): Promise<void> {
    if (this.stackIndex <= 0) return;
    if (!(await this.#checkGuard(this.active!, 'leave'))) return;

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

  async #navigate(target: RouteEntry, opts: { replace?: boolean } = {}): Promise<void> {
    const id = ++this.navId;

    if (!(await this.#checkGuard(this.active!, 'leave'))) return;
    if (id !== this.navId) return; // 守卫期间有新导航，丢弃本次
    if (!(await this.#checkGuard(target, 'enter'))) return;
    if (id !== this.navId) return;

    // 保存当前页滚动位置
    if (this.active && this.stack[this.stackIndex]) {
      this.stack[this.stackIndex].scroll = window.scrollY;
    }

    if (!opts.replace) {
      history.pushState(null, '', target.path);
    } else {
      history.replaceState(null, '', target.path);
    }

    // 加载组件
    await this.#loadComponent(target.path);
    if (id !== this.navId) return; // 加载期间有新导航，丢弃本次

    target.component = this.routes[target.path]?.component;
    this.active = target;

    this.#preloadNext();
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
    const current = location.pathname + location.search;
    const idx = this.stack.findLastIndex((r) => r.path === current);

    if (idx !== -1) {
      // 在栈中 → Router 产生的历史，移动指针
      this.stackIndex = idx;
      const entry = this.stack[idx];
      this.#navigate(entry, { replace: true });
      // 恢复滚动位置
      if (entry.scroll != null) {
        window.scrollTo(0, entry.scroll);
      }
    } else {
      // 不在栈中 → 外部跳转，重置栈
      const result = match(current, this.routes);
      const entry: RouteEntry = {
        path: current,
        params: result?.params ?? {},
      };
      this.stack = [entry];
      this.stackIndex = 0;
      this.active = entry;
    }
  };
}
