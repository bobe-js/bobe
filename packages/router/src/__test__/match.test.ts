import { describe, it, expect } from 'vitest';
import { match } from '../match';
import type { RouteMap } from '../type';
import { createRouteRecord } from '../router';

function makeMap(paths: string[]): RouteMap {
  const map: RouteMap = {};
  for (const p of paths) {
    map[p] = createRouteRecord();
  }
  return map;
}

describe('match', () => {
  it('should match static paths', () => {
    const map = makeMap(['/', '/about', '/contact']);
    expect(match('/', map)).toEqual({ path: '/', params: {}, url: '/' });
    expect(match('/about', map)).toEqual({ path: '/about', params: {}, url: '/about' });
    expect(match('/contact', map)).toEqual({ path: '/contact', params: {}, url: '/contact' });
    expect(match('/notfound', map)).toBeNull();
  });

  it('should match dynamic segments', () => {
    const map = makeMap(['/post/:id', '/user/:name']);
    expect(match('/post/42', map)).toEqual({ path: '/post/:id', params: { id: '42' }, url: '/post/42' });
    expect(match('/user/alice', map)).toEqual({ path: '/user/:name', params: { name: 'alice' }, url: '/user/alice' });
  });

  it('should match multiple dynamic segments', () => {
    const map = makeMap(['/blog/:year/:month/:slug']);
    const result = match('/blog/2024/12/hello-world', map);
    expect(result).toEqual({
      path: '/blog/:year/:month/:slug',
      params: { year: '2024', month: '12', slug: 'hello-world' },
      url: '/blog/2024/12/hello-world'
    });
  });

  it('should prefer exact match over dynamic', () => {
    const map = makeMap(['/post/new', '/post/:id']);
    // /post/new 应该在 /post/:id 之前匹配
    const m = match('/post/new', map);
    expect(m?.path).toBe('/post/new');
    expect(m?.params).toEqual({});
  });

  it('should handle paths without leading slash', () => {
    const map = makeMap(['/about']);
    expect(match('about', map)).toEqual({ path: '/about', params: {}, url: '/about' });
  });
});
