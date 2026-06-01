import type { Store } from 'aoye';

/** 路由表中每条记录 */
export type RouteRecord = {
  /** 异步 import 组件的函数（客户端 SPA 用） */
  import?: () => Promise<{ default: typeof Store } | typeof Store>;
  /** 同步组件类（SSR/SSG 用） */
  component?: typeof Store;
  /** 加载状态 */
  status: 'idle' | 'loading' | 'loaded' | 'error';
  /** 加载中的 Promise，避免重复 import */
  promise?: Promise<any>;
  /** 路径参数（动态路由时预填） */
  params?: Record<string, string>;
};

/** 路由表 */
export type RouteMap = Record<string, RouteRecord>;

/** 历史栈中的一条记录 */
export type RouteEntry = {
  path: string;
  params: Record<string, string>;
  /** 离开时的 scrollY，popstate 时恢复 */
  scroll?: number;
  /** 组件（类或实例，传给 bobe {active.component}） */
  component?: typeof Store | Store;
};

/** 目录嵌套菜单 */
export type Menu = {
  /** 菜单名 */
  name: string;
  /** 文件路径，目录有 index 时等于 dir 路径，否则为空 */
  path?: string;
  /** 子菜单 */
  children: Menu[];
};

/** 路由匹配结果 */
export type MatchResult = {
  path: string;
  params: Record<string, string>;
};

/** 路由守卫返回 */
export type GuardResult = boolean | { ok: boolean; redirect?: string };
