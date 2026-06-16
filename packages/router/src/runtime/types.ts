import type { Store } from 'aoye';
import type { GuardResult, Menu, RouteMap, RouteRecord } from '../type';

export type { GuardResult, Menu, RouteMap, RouteRecord };

export interface RuntimeRouterOptions {
  routes?: RouteMap;
  initialPath?: string;
  enterGuard?: (to: RouteEntry) => GuardResult | Promise<GuardResult>;
  leaveGuard?: (from: RouteEntry) => GuardResult | Promise<GuardResult>;
  onError?: RouterErrorHandler;
  loadTimeout?: number;
  onTimeout?: RouterTimeoutHandler;
  scrollRootId?: string;
  maxPreload?: number;
  historyKey?: string;
}

export type RouterErrorHandler = (error: unknown, ctx: NavigationContext) => void | Promise<void>;

export type RouterTimeoutDecision = 'continue' | 'cancel';

export type RouterTimeoutHandler = (
  ctx: NavigationContext
) => RouterTimeoutDecision | Promise<RouterTimeoutDecision>;

export type RouteModule =
  | {
      default?: typeof Store;
      routeMeta?: Record<string, unknown>;
      layout?: typeof Store | (() => Promise<RouteModule>);
    }
  | typeof Store;

export type RouteEntry = {
  id: string;
  path: string;
  url: string;
  hash: string;
  params: Record<string, string>;
  scroll?: ScrollSnapshot;
  component?: typeof Store | Store;
  meta?: Record<string, unknown>;
  layout?: typeof Store | (() => Promise<RouteModule>);
};

export type RouteMatch = {
  pattern: string;
  path: string;
  url: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  record: RouteRecord;
};

export type NavigationRequest =
  | {
      source: 'init' | 'api' | 'click' | 'popstate' | 'external-popstate' | 'redirect';
      url: string;
      historyMode: 'push' | 'replace' | 'none';
      runGuards: boolean;
      restoreScroll: boolean;
    }
  | {
      source: 'api';
      historyMode: 'browser-delta';
      delta: number;
      runGuards: boolean;
      restoreScroll: true;
    };

export type HistoryDeltaRequest = {
  delta: number;
  targetState?: RouterHistoryState;
  targetEntry?: RouteEntry;
};

export type NavigationStatus = 'running' | 'completed' | 'ignored' | 'blocked' | 'cancelled' | 'error';

export type NavigationContext = {
  router: RuntimeRouterLike;
  request?: NavigationRequest;
  token: NavigationToken;
  status: NavigationStatus;
  url?: string;
  match?: RouteMatch;
  from?: RouteEntry | null;
  to?: RouteEntry;
  historyDelta?: HistoryDeltaRequest;
  pendingHistoryDelta?: PendingHistoryDelta;
  guard?: GuardDecision;
  commitPlan?: NavigationCommitPlan;
  scrollIntent?: ScrollIntent;
  renderWaiter?: RenderWaiter;
  error?: unknown;
  rollbackStack: RollbackHandler[];
};

export type NavigationHandler = (
  ctx: NavigationContext
) => NavigationHandlerResult | Promise<NavigationHandlerResult>;

export type NavigationHandlerResult =
  | void
  | {
      type: 'stop';
      status?: NavigationStatus;
    }
  | {
      type: 'prepend';
      handlers: NavigationHandler[];
    }
  | {
      type: 'replace';
      handlers: NavigationHandler[];
    };

export type NavigationToken = {
  id: number;
  request?: NavigationRequest;
  cancelled: boolean;
};

export type NavigationResult = {
  status: NavigationStatus;
  ctx: NavigationContext;
  error?: unknown;
};

export type NavigationError = {
  ctx: NavigationContext;
  error: unknown;
  handler?: NavigationHandler;
};

export type RollbackHandler = (ctx: NavigationContext) => void | Promise<void>;

export type NavigationCommitPlan = {
  historyState?: RouterHistoryState;
  historyAction: 'push' | 'replace' | 'none';
  stackAction: 'append' | 'replace-current' | 'move-index' | 'reset' | 'none';
  nextStackIndex?: number;
  saveScroll?: ScrollSnapshot;
  scrollIntent?: ScrollIntent;
  renderWaiter?: RenderWaiter;
};

export type GuardDecision =
  | { type: 'allowed' }
  | { type: 'blocked'; result: GuardResult }
  | { type: 'redirect'; to: string; result: GuardResult };

export type RouterHistoryState = {
  __bobeRouter: true;
  historyKey: string;
  entryId: string;
  index: number;
  url: string;
};

export type PendingHistoryDelta = {
  tokenId: number;
  delta: number;
  fromIndex: number;
  toIndex: number;
  targetEntryId: string;
  targetUrl: string;
  consumed: boolean;
};

export type ScrollIntent =
  | {
      type: 'hash';
      hash: string;
      retry: ScrollRetryPolicy;
      behavior?: ScrollBehavior;
    }
  | {
      type: 'restore';
      top: number;
      left: number;
      retry: ScrollRetryPolicy;
    }
  | {
      type: 'top';
      retry: ScrollRetryPolicy;
    };

export type ScrollRetryPolicy = {
  attempts: number;
  maxAttempts: number;
  wait: 'post-effect' | 'raf';
};

export type RenderWaiter = {
  promise: Promise<void>;
  source: 'post-effect' | 'raf' | 'resolved';
  dispose?: () => void;
};

export type ScrollSnapshot = {
  top: number;
  left: number;
};

export type ScrollTarget = {
  root: HTMLElement | Window;
  scrollRootId?: string;
};

export type PreloadTask = {
  path: string;
  scheduledAt: number;
  fromIdleQueue: true;
};

export type ReadyCallback = () => void;

export interface RuntimeRouterLike {
  active: RouteEntry | null;
  routes: RouteMap;
  menus: Menu[];
  enterGuard?: (to: RouteEntry) => GuardResult | Promise<GuardResult>;
  leaveGuard?: (from: RouteEntry) => GuardResult | Promise<GuardResult>;
  scrollRootId?: string;
}
