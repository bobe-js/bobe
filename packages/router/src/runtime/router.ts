import { Store, StoreIgnoreKeys, effect } from 'aoye';
import { GlobalKey } from '../global';
import { match } from '../match';
import type { GuardResult, Menu, RouteMap, RouteRecord } from '../type';
import { NavigationTransactionRunner } from './transaction';
import type {
  GuardDecision,
  HistoryDeltaRequest,
  NavigationContext,
  NavigationHandler,
  NavigationRequest,
  PendingHistoryDelta,
  PreloadTask,
  ReadyCallback,
  RenderWaiter,
  RouteEntry,
  RouteMatch,
  RouteModule,
  RouterErrorHandler,
  RouterHistoryState,
  RouterTimeoutHandler,
  RuntimeRouterOptions,
  ScrollIntent,
  ScrollRetryPolicy,
  ScrollSnapshot,
} from './types';

const DEFAULT_HISTORY_KEY = '__bobe_router_runtime__';

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
  static [StoreIgnoreKeys] = [
    'routes',
    'menus',
    'stack',
    'ready',
    'scrollRootId',
    'historyKey',
    'maxPreload',
    'onError',
    'loadTimeout',
    'onTimeout',
  ] as string[];

  active: RouteEntry | null = null;
  routes: RouteMap = {};
  menus: Menu[] = [];
  enterGuard?: (to: RouteEntry) => GuardResult | Promise<GuardResult>;
  leaveGuard?: (from: RouteEntry) => GuardResult | Promise<GuardResult>;
  onError?: RouterErrorHandler;
  loadTimeout?: number;
  onTimeout?: RouterTimeoutHandler;
  scrollRootId?: string;
  maxPreload = 3;
  historyKey = DEFAULT_HISTORY_KEY;

  #stack: RouteEntry[] = [];
  #stackIndex = 0;
  #ready = false;
  #readyQueue: ReadyCallback[] = [];
  #idleSet = new Set<string>();
  #loadingCount = 0;
  #pendingHistoryDelta: PendingHistoryDelta | null = null;
  #initialHistoryState: RouterHistoryState | null = null;
  #transaction = new NavigationTransactionRunner();
  #entryId = 0;

  constructor(opt?: RuntimeRouterOptions) {
    super();

    this.routes = opt?.routes || (globalThis as any)[GlobalKey.Routes] || {};
    this.menus = (globalThis as any)[GlobalKey.Menus] || [];
    this.enterGuard = opt?.enterGuard;
    this.leaveGuard = opt?.leaveGuard;
    this.onError = opt?.onError;
    this.loadTimeout = opt?.loadTimeout;
    this.onTimeout = opt?.onTimeout;
    this.scrollRootId = opt?.scrollRootId;
    this.maxPreload = opt?.maxPreload ?? this.maxPreload;
    this.historyKey = opt?.historyKey || DEFAULT_HISTORY_KEY;
    this.#initialHistoryState = this.#hasBrowser() ? this.#readHistoryState(history.state) : null;

    const initialUrl =
      opt?.initialPath ||
      (globalThis as any)[GlobalKey.Path] ||
      (this.#hasBrowser() ? location.pathname + location.search + location.hash : '/');

    this.#initIdleSet();
    void this.#init(initialUrl);
  }

  ready(): Promise<void>;
  ready(cb: ReadyCallback): void;
  ready(cb?: ReadyCallback): Promise<void> | void {
    if (cb) {
      if (this.#ready) cb();
      else this.#readyQueue.push(cb);
      return;
    }
    return new Promise<void>(resolve => this.ready(resolve));
  }

  async pushState(url: string): Promise<void> {
    const request: NavigationRequest = {
      source: 'api',
      url,
      historyMode: 'push',
      runGuards: true,
      restoreScroll: false,
    };
    await this.#runNavigation(request, [
      this.#handleCreateUrlContext(request),
      this.#handleBuildRouteEntry,
      this.#handleSaveCurrentScroll,
      this.#handleRunGuards,
      this.#handleLoadComponent,
      this.#handleBuildCommitPlan('push', 'append', () => this.#stackIndex + 1),
      this.#handleCommitHistory,
      this.#handleCommitStack,
      this.#handlePrepareScrollWaiter,
      this.#handleSetActive,
      this.#handleScroll,
      this.#handleStartIdlePreload,
    ]);
  }

  async replaceState(url: string): Promise<void> {
    const request: NavigationRequest = {
      source: 'api',
      url,
      historyMode: 'replace',
      runGuards: true,
      restoreScroll: false,
    };
    await this.#runNavigation(request, this.#replaceHandlers(request));
  }

  async back(): Promise<void> {
    await this.#goByDelta(-1);
  }

  async forward(): Promise<void> {
    await this.#goByDelta(1);
  }

  async go(delta: number): Promise<void> {
    if (delta === 0) return;
    await this.#goByDelta(delta);
  }

  async #init(url: string): Promise<void> {
    const request: NavigationRequest = {
      source: 'init',
      url,
      historyMode: 'replace',
      runGuards: true,
      restoreScroll: false,
    };

    await this.#runNavigation(request, [
      this.#handleCreateUrlContext(request),
      this.#handleBuildRouteEntry,
      this.#handleRunGuards,
      this.#handleLoadComponent,
      this.#handleBuildCommitPlan('replace', 'replace-current', ctx => {
        const existingState = this.#initialHistoryState;
        if (existingState && ctx.to) ctx.to.id = existingState.entryId;
        return existingState?.index ?? 0;
      }),
      this.#handleCommitHistory,
      this.#handleCommitStack,
      this.#handlePrepareScrollWaiter,
      this.#handleSetActive,
      this.#handleScroll,
      this.#handleStartIdlePreload,
    ]);

    this.#initBrowser();
    this.#ready = true;
    const queue = this.#readyQueue;
    this.#readyQueue = [];
    for (const cb of queue) cb();
  }

  async #goByDelta(delta: number): Promise<void> {
    if (!this.#hasBrowser()) return;
    const request: NavigationRequest = {
      source: 'api',
      historyMode: 'browser-delta',
      delta,
      runGuards: true,
      restoreScroll: true,
    };
    await this.#runNavigation(request, [
      ctx => {
        ctx.historyDelta = { delta: request.delta };
        ctx.from = this.active;
      },
      this.#handleResolveHistoryDeltaTarget,
      this.#handleBuildRouteEntryFromStack,
      this.#handleSaveCurrentScroll,
      this.#handleRunGuards,
      this.#handleLoadComponent,
      this.#handleSetPendingHistoryDelta,
      ctx => {
        const delta = ctx.historyDelta?.delta;
        if (!this.#hasBrowser() || typeof delta !== 'number') return;
        history.go(delta);
      },
    ]);
  }

  async #runNavigation(request: NavigationRequest | undefined, handlers: NavigationHandler[]) {
    const result = await this.#transaction.run(this, handlers, request);
    if (result.status === 'error') {
      await this.#notifyNavigationError(result.error, result.ctx);
    }
    return result;
  }

  async #notifyNavigationError(error: unknown, ctx: NavigationContext): Promise<void> {
    if (!this.onError) {
      console.error(error);
      return;
    }

    try {
      await this.onError(error, ctx);
    } catch (notifyError) {
      console.error(notifyError);
    }
  }

  #replaceHandlers(request: Extract<NavigationRequest, { url: string }>): NavigationHandler[] {
    return [
      this.#handleCreateUrlContext(request),
      this.#handleBuildRouteEntry,
      this.#handleRunGuards,
      this.#handleLoadComponent,
      this.#handleBuildCommitPlan('replace', 'replace-current', () => this.#stackIndex),
      this.#handleCommitHistory,
      this.#handleCommitStack,
      this.#handlePrepareScrollWaiter,
      this.#handleSetActive,
      this.#handleScroll,
      this.#handleStartIdlePreload,
    ];
  }

  #hashOnlyScrollHandlers(url: string): NavigationHandler[] {
    return [
      ctx => {
        ctx.url = url;
        ctx.from = this.active;
        ctx.to = this.active ?? undefined;
        ctx.scrollIntent = this.#createScrollIntentFromUrl(url, undefined, false);
        ctx.commitPlan = {
          historyAction: 'none',
          stackAction: 'none',
          scrollIntent: ctx.scrollIntent,
        };
        if (this.active) {
          const parsed = this.#parseUrl(url);
          this.active.url = url;
          this.active.hash = parsed.hash;
          if (this.#stack[this.#stackIndex]?.id === this.active.id) {
            this.#stack[this.#stackIndex].url = url;
            this.#stack[this.#stackIndex].hash = parsed.hash;
          }
        }
      },
      this.#handlePrepareScrollWaiter,
      this.#handleScroll,
    ];
  }

  #handleCreateUrlContext(request: Extract<NavigationRequest, { url: string }>): NavigationHandler {
    return ctx => {
      ctx.request = request;
      ctx.url = request.url;
      ctx.from = this.active;
    };
  }

  #handleBuildRouteEntry: NavigationHandler = ctx => {
    if (!ctx.url) return this.#transaction.stop('ignored');
    const routeMatch = this.#matchUrl(ctx.url);
    if (!routeMatch) return this.#transaction.stop('ignored');
    ctx.match = routeMatch;
    ctx.to = this.#createRouteEntry(routeMatch);
    ctx.scrollIntent = this.#createScrollIntentFromUrl(ctx.to.url);
  };

  #handleBuildRouteEntryFromStack: NavigationHandler = ctx => {
    const target = ctx.historyDelta?.targetEntry;
    if (!target) {
      this.#allowExternalHistoryDelta(ctx);
      return this.#transaction.stop('completed');
    }
    ctx.to = target;
    ctx.url = target.url;
    const routeMatch = this.#matchUrl(target.url);
    if (routeMatch) ctx.match = routeMatch;
    ctx.scrollIntent = target.scroll
      ? this.#createRestoreScrollIntent(target.scroll)
      : this.#createScrollIntentFromUrl(target.url);
  };

  #handleBuildRouteEntryFromHistoryState(state: RouterHistoryState): NavigationHandler {
    return ctx => {
      const entry = this.#stack[state.index];
      ctx.historyDelta = {
        delta: state.index - this.#stackIndex,
        targetState: state,
        targetEntry: entry,
      };

      if (entry && entry.id === state.entryId) {
        ctx.to = entry;
        ctx.url = entry.url;
        const routeMatch = this.#matchUrl(entry.url);
        if (routeMatch) ctx.match = routeMatch;
        ctx.scrollIntent = entry.scroll
          ? this.#createRestoreScrollIntent(entry.scroll)
          : this.#createScrollIntentFromUrl(entry.url);
        return;
      }

      const routeMatch = this.#matchUrl(ctx.url || state.url);
      if (!routeMatch) return this.#transaction.stop('ignored');
      ctx.match = routeMatch;
      ctx.to = this.#createRouteEntry(routeMatch, state.entryId);
      ctx.historyDelta.targetEntry = ctx.to;
      ctx.scrollIntent = this.#createScrollIntentFromUrl(ctx.to.url);
    };
  }

  #handleResolveHistoryDeltaTarget: NavigationHandler = ctx => {
    const delta = ctx.historyDelta?.delta ?? 0;
    const nextIndex = this.#stackIndex + delta;

    if (nextIndex < 0 || nextIndex >= this.#stack.length || !this.#stack[nextIndex]) {
      this.#allowExternalHistoryDelta(ctx);
      return this.#transaction.stop('completed');
    }

    ctx.historyDelta = {
      delta,
      targetEntry: this.#stack[nextIndex],
      targetState: this.#createHistoryState(this.#stack[nextIndex], nextIndex),
    };
  };

  #handleRunGuards: NavigationHandler = async ctx => {
    if (ctx.request && !ctx.request.runGuards) {
      ctx.guard = { type: 'allowed' };
      return;
    }
    if (!ctx.to) return this.#transaction.stop('ignored');

    const decision = await this.#runGuardsOnce(ctx.from ?? null, ctx.to);
    if (!this.#transaction.isTokenValid(ctx)) return this.#transaction.stop('cancelled');

    ctx.guard = decision;
    if (decision.type === 'allowed') return;
    if (decision.type === 'blocked') {
      this.#rollbackBrowserHistoryIfNeeded(ctx);
      return this.#transaction.stop('blocked');
    }
    return this.#transaction.replace(
      this.#replaceHandlers({
        source: 'redirect',
        url: decision.to,
        historyMode: 'replace',
        runGuards: true,
        restoreScroll: false,
      })
    );
  };

  #handleLoadComponent: NavigationHandler = async ctx => {
    if (!ctx.to) return this.#transaction.stop('ignored');
    const pattern = ctx.match?.pattern || this.#matchUrl(ctx.to.url)?.pattern || ctx.to.path;
    await this.#loadComponentWithTimeout(pattern, ctx);
    if (!this.#transaction.isTokenValid(ctx)) return this.#transaction.stop('cancelled');
    this.#syncRouteRecordToEntry(ctx.to, pattern);
  };

  #handleSaveCurrentScroll: NavigationHandler = () => {
    this.#saveScroll(this.#stackIndex);
  };

  #handleBuildCommitPlan(
    historyAction: 'push' | 'replace',
    stackAction: 'append' | 'replace-current' | 'reset',
    getNextStackIndex: (ctx: NavigationContext) => number
  ): NavigationHandler {
    return ctx => {
      if (!ctx.to) return this.#transaction.stop('ignored');
      const nextStackIndex = getNextStackIndex(ctx);
      ctx.commitPlan = {
        historyState: this.#createHistoryState(ctx.to, nextStackIndex),
        historyAction,
        stackAction,
        nextStackIndex,
        scrollIntent: ctx.scrollIntent,
      };
    };
  }

  #handleBuildPopstateMoveCommitPlan(state: RouterHistoryState): NavigationHandler {
    return ctx => {
      if (!ctx.to) return this.#transaction.stop('ignored');
      const hasMemoryEntry = !!this.#stack[state.index] && this.#stack[state.index].id === state.entryId;
      ctx.commitPlan = {
        historyState: hasMemoryEntry ? state : this.#createHistoryState(ctx.to, 0),
        historyAction: hasMemoryEntry ? 'none' : 'replace',
        stackAction: hasMemoryEntry ? 'move-index' : 'reset',
        nextStackIndex: hasMemoryEntry ? state.index : 0,
        scrollIntent: ctx.scrollIntent,
      };
    };
  }

  #handleCommitHistory: NavigationHandler = ctx => {
    const action = ctx.commitPlan?.historyAction;
    if (!action || action === 'none') return;
    if (!this.#hasBrowser() || !ctx.to || !ctx.commitPlan?.historyState) return;
    const previousState = history.state;
    const previousUrl = this.#toUrlString(location);

    if (action === 'push') {
      history.pushState(ctx.commitPlan.historyState, '', ctx.to.url);
      ctx.rollbackStack.push(() => {
        if (this.#hasBrowser()) history.go(-1);
      });
    } else {
      history.replaceState(ctx.commitPlan.historyState, '', ctx.to.url);
      ctx.rollbackStack.push(() => {
        if (this.#hasBrowser()) history.replaceState(previousState, '', previousUrl);
      });
    }
  };

  #handleCommitStack: NavigationHandler = ctx => {
    const action = ctx.commitPlan?.stackAction;
    if (!action || action === 'none') return;

    const previousStack = this.#stack.slice();
    const previousStackIndex = this.#stackIndex;
    const rollbackStack = () => {
      this.#stack = previousStack;
      this.#stackIndex = previousStackIndex;
    };

    if (action === 'move-index') {
      const nextIndex = ctx.commitPlan?.nextStackIndex;
      if (typeof nextIndex !== 'number' || !this.#stack[nextIndex]) {
        return this.#transaction.stop('ignored');
      }
      this.#stackIndex = nextIndex;
      ctx.to = ctx.to || this.#stack[nextIndex];
      ctx.rollbackStack.push(rollbackStack);
      return;
    }

    if (!ctx.to) return this.#transaction.stop('ignored');

    if (action === 'append') {
      this.#stack.length = this.#stackIndex + 1;
      this.#stack.push(ctx.to);
      this.#stackIndex = this.#stack.length - 1;
      ctx.rollbackStack.push(rollbackStack);
      return;
    }

    if (action === 'replace-current') {
      const nextIndex = ctx.commitPlan?.nextStackIndex ?? this.#stackIndex;
      this.#stack[nextIndex] = ctx.to;
      this.#stackIndex = nextIndex;
      ctx.rollbackStack.push(rollbackStack);
      return;
    }

    if (action === 'reset') {
      this.#stack = [ctx.to];
      this.#stackIndex = 0;
      ctx.rollbackStack.push(rollbackStack);
    }
  };

  #handleSetActive: NavigationHandler = ctx => {
    if (!ctx.to) return this.#transaction.stop('ignored');
    const previousActive = this.active;
    this.active = ctx.to;
    ctx.rollbackStack.push(() => {
      this.active = previousActive;
    });
  };

  #handleRegisterPopstateRollback: NavigationHandler = ctx => {
    if (!this.#hasBrowser()) return;

    if (ctx.request?.source === 'popstate') {
      const delta = ctx.historyDelta?.delta;
      if (typeof delta === 'number' && delta !== 0) {
        ctx.rollbackStack.push(() => {
          if (this.#hasBrowser()) history.go(-delta);
        });
      }
      return;
    }

    if (ctx.request?.source === 'external-popstate' && ctx.from) {
      const previousEntry = ctx.from;
      const previousState = this.#createHistoryState(previousEntry, this.#stackIndex);
      ctx.rollbackStack.push(() => {
        if (this.#hasBrowser()) history.replaceState(previousState, '', previousEntry.url);
      });
    }
  };

  #handleSetPendingHistoryDelta: NavigationHandler = ctx => {
    const delta = ctx.historyDelta?.delta;
    const target = ctx.historyDelta?.targetEntry;
    if (typeof delta !== 'number' || !target) {
      return this.#transaction.stop('ignored');
    }

    const toIndex = this.#stackIndex + delta;
    this.#pendingHistoryDelta = {
      tokenId: ctx.token.id,
      delta,
      fromIndex: this.#stackIndex,
      toIndex,
      targetEntryId: target.id,
      targetUrl: target.url,
      consumed: false,
    };
  };

  #handlePrepareScrollWaiter: NavigationHandler = ctx => {
    const scrollIntent = ctx.scrollIntent || ctx.commitPlan?.scrollIntent;
    if (!scrollIntent) return;

    const needsActiveRender = ctx.commitPlan?.stackAction !== 'none';
    const renderWaiter = needsActiveRender
      ? this.#createPostEffectWaiter()
      : this.#createFallbackWaiter(scrollIntent.retry.wait);

    ctx.renderWaiter = renderWaiter;
    if (ctx.commitPlan) ctx.commitPlan.renderWaiter = renderWaiter;
    ctx.rollbackStack.push(() => renderWaiter.dispose?.());
  };

  #handleScroll: NavigationHandler = async ctx => {
    const scrollIntent = ctx.scrollIntent || ctx.commitPlan?.scrollIntent;
    if (!scrollIntent) return;

    const waiter = ctx.renderWaiter || ctx.commitPlan?.renderWaiter || this.#createFallbackWaiter(scrollIntent.retry.wait);
    await waiter.promise;
    waiter.dispose?.();
    if (!this.#transaction.isTokenValid(ctx)) return this.#transaction.stop('cancelled');

    await this.#applyScrollIntent(ctx, scrollIntent);
  };

  #handleStartIdlePreload: NavigationHandler = () => {
    this.#preloadNext();
  };

  #initBrowser(): void {
    if (!this.#hasBrowser()) return;

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    document.addEventListener('click', this.#onClick);
    window.addEventListener('popstate', this.#onPopstate);
  }

  #onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const nextUrl = this.#toUrlString(url);

      if (href.startsWith('#') && !this.#isHashOnlyForActive(nextUrl)) return;

      event.preventDefault();
      if (this.active && this.#isSameRouteBase(nextUrl, this.active.url) && this.#toUrlString(location) !== nextUrl) {
        void this.#runNavigation(undefined, this.#hashOnlyScrollHandlers(nextUrl));
        this.active.url = nextUrl;
        this.active.hash = url.hash;
        if (this.#stack[this.#stackIndex]) {
          this.#stack[this.#stackIndex].url = nextUrl;
          this.#stack[this.#stackIndex].hash = url.hash;
        }
        history.pushState(
          { ...this.#createHistoryState(this.active, this.#stackIndex), url: nextUrl },
          '',
          nextUrl
        );
        return;
      }

      void this.pushState(nextUrl);
    } catch {
      // Let the browser handle malformed href values.
    }
  };

  #onPopstate = (event: PopStateEvent): void => {
    void this.#handlePopstate(event).catch(error => {
      console.error(error);
    });
  };

  async #handlePopstate(event: PopStateEvent): Promise<void> {
    const url = this.#toUrlString(location);
    const state = this.#readHistoryState(event.state);

    if (state && this.#isValidPendingHistoryDelta(state, url)) {
      const entry = this.#stack[state.index];
      const scrollIntent = entry.scroll
        ? this.#createRestoreScrollIntent(entry.scroll)
        : this.#createScrollIntentFromUrl(entry.url);
      await this.#runNavigation(undefined, [
        ctx => {
          if (!this.#pendingHistoryDelta) return this.#transaction.stop('ignored');
          this.#pendingHistoryDelta.consumed = true;
          this.#pendingHistoryDelta = null;
        },
        ctx => {
          ctx.to = entry;
          ctx.url = entry.url;
          ctx.scrollIntent = scrollIntent;
          ctx.commitPlan = {
            historyState: state,
            historyAction: 'none',
            stackAction: 'move-index',
            nextStackIndex: state.index,
            scrollIntent,
          };
        },
        this.#handleCommitStack,
        this.#handlePrepareScrollWaiter,
        this.#handleSetActive,
        this.#handleScroll,
        this.#handleStartIdlePreload,
      ]);
      return;
    }

    if (this.#isHashOnlyForActive(url) && (!state || state.index === this.#stackIndex)) {
      await this.#runNavigation(undefined, this.#hashOnlyScrollHandlers(url));
      return;
    }

    if (!state) {
      const request: NavigationRequest = {
        source: 'external-popstate',
        url,
        historyMode: 'replace',
        runGuards: true,
        restoreScroll: false,
      };
      await this.#runNavigation(undefined, [
        this.#handleCreateUrlContext(request),
        this.#handleBuildRouteEntry,
        this.#handleSaveCurrentScroll,
        this.#handleRegisterPopstateRollback,
        this.#handleRunGuards,
        this.#handleLoadComponent,
        this.#handleBuildCommitPlan('replace', 'reset', () => 0),
        this.#handleCommitHistory,
        this.#handleCommitStack,
        this.#handlePrepareScrollWaiter,
        this.#handleSetActive,
        this.#handleScroll,
        this.#handleStartIdlePreload,
      ]);
      return;
    }

    const request: NavigationRequest = {
      source: 'popstate',
      url,
      historyMode: 'none',
      runGuards: true,
      restoreScroll: true,
    };
    await this.#runNavigation(undefined, [
      this.#handleCreateUrlContext(request),
      this.#handleBuildRouteEntryFromHistoryState(state),
      this.#handleSaveCurrentScroll,
      this.#handleRegisterPopstateRollback,
      this.#handleRunGuards,
      this.#handleLoadComponent,
      this.#handleBuildPopstateMoveCommitPlan(state),
      this.#handleCommitHistory,
      this.#handleCommitStack,
      this.#handlePrepareScrollWaiter,
      this.#handleSetActive,
      this.#handleScroll,
      this.#handleStartIdlePreload,
    ]);
  }

  async #runGuardsOnce(from: RouteEntry | null, to: RouteEntry): Promise<GuardDecision> {
    if (from && this.leaveGuard) {
      const result = await this.leaveGuard(from);
      const decision = this.#toGuardDecision(result);
      if (decision.type !== 'allowed') return decision;
    }

    if (this.enterGuard) {
      const result = await this.enterGuard(to);
      return this.#toGuardDecision(result);
    }

    return { type: 'allowed' };
  }

  #toGuardDecision(result: GuardResult): GuardDecision {
    if (result === false) return { type: 'blocked', result };
    if (result === true) return { type: 'allowed' };
    if (result && typeof result === 'object') {
      if (result.redirect) return { type: 'redirect', to: result.redirect, result };
      if (!result.ok) return { type: 'blocked', result };
      return { type: 'allowed' };
    }
    return { type: 'allowed' };
  }

  async #loadComponent(pattern: string, counted = false): Promise<typeof Store | Store | undefined> {
    const route = this.routes[pattern];
    if (!route) {
      if (counted) this.#loadingCount--;
      return undefined;
    }

    switch (route.status) {
      case 'loaded':
        if (counted) this.#loadingCount--;
        return route.component;
      case 'loading':
        if (counted) this.#loadingCount--;
        return route.promise;
      case 'error':
      case 'idle':
        break;
    }

    if (!route.import) {
      if (route.component) {
        route.status = 'loaded';
        if (counted) this.#loadingCount--;
        return route.component;
      }
      if (counted) this.#loadingCount--;
      throw new Error(`Route "${pattern}" has no import function`);
    }

    this.#idleSet.delete(pattern);
    route.status = 'loading';
    if (!counted) this.#loadingCount++;
    route.promise = route.import()
      .then((mod: RouteModule) => {
        const record = mod as any;
        const component = typeof mod === 'function' ? mod : record.default || mod;
        route.status = 'loaded';
        route.component = component;
        if (!route.meta && record.routeMeta) route.meta = record.routeMeta;
        if (!route.layout && record.layout) route.layout = record.layout;
        return route.component;
      })
      .catch(error => {
        route.status = 'error';
        throw error;
      })
      .finally(() => {
        this.#loadingCount--;
        this.#preloadNext();
      });

    return route.promise;
  }

  async #loadComponentWithTimeout(pattern: string, ctx: NavigationContext): Promise<typeof Store | Store | undefined> {
    const promise = this.#loadComponent(pattern);
    const timeout = this.loadTimeout;

    if (!timeout || timeout <= 0) {
      return promise;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<'timeout'>(resolve => {
      timeoutId = setTimeout(() => resolve('timeout'), timeout);
    });

    let result: Awaited<typeof promise> | 'timeout';
    try {
      result = await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (result !== 'timeout') {
      return result;
    }

    const decision = this.onTimeout ? await this.onTimeout(ctx) : 'continue';
    if (decision === 'cancel') {
      throw new Error(`Route "${pattern}" import timed out after ${timeout}ms`);
    }

    return promise;
  }

  #preloadNext(): void {
    if (!this.#hasBrowser()) return;
    while (this.#loadingCount < this.maxPreload && this.#idleSet.size > 0) {
      const path = this.#idleSet.values().next().value;
      if (!path) return;
      this.#idleSet.delete(path);
      this.#loadingCount++;
      const task: PreloadTask = { path, scheduledAt: Date.now(), fromIdleQueue: true };
      const scheduler =
        typeof requestIdleCallback !== 'undefined'
          ? requestIdleCallback
          : (fn: () => void) => setTimeout(fn, 0);
      scheduler(() => {
        this.#loadComponent(task.path, true).catch(error => {
          const route = this.routes[task.path];
          if (route) route.status = 'error';
          console.error(error);
        });
      });
    }
  }

  async #applyScrollIntent(ctx: NavigationContext, intent: ScrollIntent): Promise<void> {
    const retry = { ...intent.retry };

    while (true) {
      if (!this.#transaction.isTokenValid(ctx)) return;

      if (intent.type === 'hash') {
        const el = this.#queryHashElement(intent.hash);
        if (el) {
          el.scrollIntoView({ behavior: intent.behavior ?? 'smooth' });
          return;
        }
      } else if (intent.type === 'restore') {
        const target = this.#getScrollTarget();
        if (target) {
          this.#setScroll(target.root, intent.top, intent.left);
          return;
        }
      } else {
        const target = this.#getScrollTarget();
        if (target) {
          this.#setScroll(target.root, 0, 0);
          return;
        }
      }

      if (retry.attempts >= retry.maxAttempts) return;
      retry.attempts++;
      await this.#createFallbackWaiter('raf').promise;
    }
  }

  #createPostEffectWaiter(): RenderWaiter {
    if (!this.#hasBrowser()) return this.#createFallbackWaiter('resolved');

    let dispose: (() => void) | undefined;
    const promise = new Promise<void>(resolve => {
      const watcher = effect(
        () => {
          resolve();
          queueMicrotask(() => dispose?.());
        },
        [() => this.active],
        { type: 'post', immediate: false }
      );
      dispose = () => watcher.dispose();
    });

    return {
      promise: promise.finally(() => dispose?.()),
      source: 'post-effect',
      dispose: () => dispose?.(),
    };
  }

  #createFallbackWaiter(wait: ScrollRetryPolicy['wait'] | 'resolved'): RenderWaiter {
    if (wait === 'raf' && typeof requestAnimationFrame !== 'undefined') {
      return {
        promise: new Promise(resolve => requestAnimationFrame(() => resolve())),
        source: 'raf',
      };
    }
    return { promise: Promise.resolve(), source: 'resolved' };
  }

  #createScrollIntentFromUrl(url: string, snapshot?: ScrollSnapshot, renderDependent = true): ScrollIntent {
    const parsed = this.#parseUrl(url);
    const retry = this.#createRetry(renderDependent ? 'post-effect' : 'raf');
    if (parsed.hash) {
      return { type: 'hash', hash: parsed.hash, retry, behavior: 'smooth' };
    }
    if (snapshot) {
      return { type: 'restore', top: snapshot.top, left: snapshot.left, retry };
    }
    return { type: 'top', retry };
  }

  #createRestoreScrollIntent(snapshot: ScrollSnapshot): ScrollIntent {
    return {
      type: 'restore',
      top: snapshot.top,
      left: snapshot.left,
      retry: this.#createRetry('post-effect'),
    };
  }

  #createRetry(wait: ScrollRetryPolicy['wait']): ScrollRetryPolicy {
    return { attempts: 0, maxAttempts: 8, wait };
  }

  #saveScroll(index: number): void {
    const entry = this.#stack[index];
    if (!entry || !this.#hasBrowser()) return;
    entry.scroll = this.#getScrollSnapshot();
  }

  #getScrollSnapshot(): ScrollSnapshot {
    const target = this.#getScrollTarget();
    if (!target) return { top: 0, left: 0 };
    if (target.root === window) {
      return { top: window.scrollY, left: window.scrollX };
    }
    return {
      top: (target.root as HTMLElement).scrollTop,
      left: (target.root as HTMLElement).scrollLeft,
    };
  }

  #getScrollTarget() {
    if (!this.#hasBrowser()) return null;
    if (this.scrollRootId) {
      const el = document.getElementById(this.scrollRootId);
      if (el) return { root: el, scrollRootId: this.scrollRootId };
    }
    return { root: window, scrollRootId: this.scrollRootId };
  }

  #setScroll(root: HTMLElement | Window, top: number, left: number): void {
    if (root === window) {
      window.scrollTo(left, top);
      return;
    }
    const el = root as HTMLElement;
    el.scrollTop = top;
    el.scrollLeft = left;
  }

  #queryHashElement(hash: string): HTMLElement | null {
    if (typeof document === 'undefined' || !hash) return null;
    try {
      return document.querySelector(decodeURIComponent(hash));
    } catch {
      return null;
    }
  }

  #allowExternalHistoryDelta(ctx: NavigationContext): void {
    const delta = ctx.historyDelta?.delta;
    if (!this.#hasBrowser() || typeof delta !== 'number') return;
    history.go(delta);
  }

  #rollbackBrowserHistoryIfNeeded(ctx: NavigationContext): void {
    const delta = ctx.historyDelta?.delta;
    if (ctx.request?.source !== 'popstate') return;
    if (!this.#hasBrowser() || typeof delta !== 'number') return;
    history.go(-delta);
  }

  #isValidPendingHistoryDelta(state: RouterHistoryState, url: string): boolean {
    const pending = this.#pendingHistoryDelta;
    if (!pending || pending.consumed) return false;
    if (!this.#transaction.isTokenIdCurrent(pending.tokenId)) return false;
    if (state.historyKey !== this.historyKey) return false;
    if (state.index !== pending.toIndex) return false;
    if (state.entryId !== pending.targetEntryId) return false;
    if (this.#normalizeUrl(url) !== this.#normalizeUrl(pending.targetUrl)) return false;
    return true;
  }

  #readHistoryState(state: unknown): RouterHistoryState | null {
    if (!state || typeof state !== 'object') return null;
    const value = state as RouterHistoryState;
    if (!value.__bobeRouter || value.historyKey !== this.historyKey) return null;
    if (typeof value.entryId !== 'string' || typeof value.index !== 'number') return null;
    return value;
  }

  #createHistoryState(entry: RouteEntry, index: number): RouterHistoryState {
    return {
      __bobeRouter: true,
      historyKey: this.historyKey,
      entryId: entry.id,
      index,
      url: entry.url,
    };
  }

  #createRouteEntry(routeMatch: RouteMatch, id = this.#createEntryId()): RouteEntry {
    return {
      id,
      path: routeMatch.url,
      url: this.#buildUrl(routeMatch.url, routeMatch.search, routeMatch.hash),
      hash: routeMatch.hash,
      params: routeMatch.params,
      component: routeMatch.record.component,
      meta: routeMatch.record.meta,
      layout: routeMatch.record.layout as RouteEntry['layout'],
    };
  }

  #syncRouteRecordToEntry(entry: RouteEntry, pattern: string): void {
    const route = this.routes[pattern];
    if (!route) return;
    entry.component = route.component;
    entry.meta = route.meta;
    entry.layout = route.layout as RouteEntry['layout'];
  }

  #matchUrl(url: string): RouteMatch | null {
    const result = match(url, this.routes);
    if (!result) return null;
    const parsed = this.#parseUrl(url);
    const record = this.routes[result.path];
    if (!record) return null;
    return {
      pattern: result.path,
      path: result.path,
      url: result.url,
      search: parsed.search,
      hash: parsed.hash,
      params: result.params,
      record,
    };
  }

  #parseUrl(url: string): URL {
    const base = this.#hasBrowser() ? location.origin : 'http://localhost';
    return new URL(url, base);
  }

  #buildUrl(path: string, search = '', hash = ''): string {
    return `${path}${search}${hash}`;
  }

  #normalizePath(path: string): string {
    const result = match(path, this.routes);
    return result?.url || path;
  }

  #normalizeUrl(url: string): string {
    const parsed = this.#parseUrl(url);
    return this.#buildUrl(this.#normalizePath(parsed.pathname), parsed.search, parsed.hash);
  }

  #isSameRouteBase(left: string, right: string): boolean {
    const a = this.#parseUrl(left);
    const b = this.#parseUrl(right);
    return this.#normalizePath(a.pathname) === this.#normalizePath(b.pathname) && a.search === b.search;
  }

  #toUrlString(url: Pick<URL, 'pathname' | 'search' | 'hash'>): string {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  #isHashOnlyForActive(url: string): boolean {
    if (!this.active) return false;
    return this.#isSameRouteBase(url, this.active.url);
  }

  #createEntryId(): string {
    this.#entryId++;
    return `${this.historyKey}:${this.#entryId}`;
  }

  #initIdleSet(): void {
    for (const path of Object.keys(this.routes)) {
      if (this.routes[path].status === 'idle') {
        this.#idleSet.add(path);
      }
    }
  }

  #hasBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof history !== 'undefined';
  }
}
