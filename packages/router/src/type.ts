import type { Store } from 'aoye';

/** Router 构造选项 */
export interface RouterOptions {
  routes?: RouteMap;
  initialPath?: string;
}

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
  /** 自定义路由元信息（构建时从 export const routeMeta 提取，或手动传入） */
  meta?: Record<string, any>;
  /** 布局组件（从模块 named export 获取，或手动传入） */
  layout?: typeof Store | (() => Promise<{ default: typeof Store } | typeof Store>);
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
  /** 当前路由的元信息（从 RouteRecord 同步） */
  meta?: Record<string, any>;
  /** 当前路由的布局组件（从 RouteRecord 同步） */
  layout?: typeof Store | (() => Promise<{ default: typeof Store } | typeof Store>);
};

/** 目录嵌套菜单 */
export type Menu = {
  /** 菜单名 */
  name: string;
  /** 文件路径，目录有 index 时等于 dir 路径，否则为空 */
  path?: string;
  /** 是否有对应组件（目录无 index 时为 false） */
  hasComponent: boolean;
  /** 子菜单 */
  children?: Menu[];
  /** 路由元信息（从 index 文件的 export const routeMeta 提取） */
  meta?: Record<string, any>;
  /** 离本目录最近的、有组件的子孙文件（目录自身有 index 组件时指向自身） */
  nearestFile?: {
    name: string;
    path: string;
  };
};

/** 路由匹配结果 */
export type MatchResult = {
  path: string;
  params: Record<string, string>;
};

/** 路由守卫返回 */
export type GuardResult = boolean | { ok: boolean; redirect?: string };
