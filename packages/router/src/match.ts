import type { RouteMap, MatchResult } from './type';

/** 编译路径模式为正则：/post/:id → ^\/post\/([^/]+)$，捕获名为 id */
function compilePattern(pattern: string): { regex: RegExp; params: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
    .replace(/:([a-zA-Z_]\w*)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
  return {
    regex: new RegExp(`^${regexStr}$`),
    params: paramNames,
  };
}

/** 预编译所有路由的正则 */
type CompiledRoute = {
  pattern: string;
  regex: RegExp;
  paramNames: string[];
};

let compiledCache: CompiledRoute[] | null = null;
let cacheKey: RouteMap | null = null;

function compileRoutes(map: RouteMap): CompiledRoute[] {
  if (cacheKey === map && compiledCache) return compiledCache;
  compiledCache = Object.keys(map)
    .filter((k) => k !== '*') // 通配符最后匹配
    .map((pattern) => {
      const { regex, params: paramNames } = compilePattern(pattern);
      return { pattern, regex, paramNames };
    });
  // 通配符路由放最后
  if (map['*']) {
    compiledCache.push({ pattern: '*', regex: /.*/, paramNames: [] });
  }
  cacheKey = map;
  return compiledCache;
}

/**
 * 根据路径匹配路由表
 * @param path - URL 路径，如 /post/42、/about/?foo=bar#sec
 * @param map - 路由表
 * @returns 匹配结果，含路径参数；null 表示 404
 */
export function match(path: string, map: RouteMap): MatchResult | null {
  // 用 URL API 解析，自动剥离 query string 和 hash
  const parsed = new URL(path, 'http://localhost');
  let normalized = parsed.pathname;

  // 去掉尾部 /（根路径 / 保留）
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  for (const compiled of compileRoutes(map)) {
    const m = normalized.match(compiled.regex);
    if (!m) continue;

    const params: Record<string, string> = {};
    for (let i = 0; i < compiled.paramNames.length; i++) {
      params[compiled.paramNames[i]] = m[i + 1];
    }
    return { path: compiled.pattern, params, url: normalized };
  }
  return null;
}
