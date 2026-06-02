import type { Plugin } from 'vite';
import { resolve } from 'path';
import { scanDir } from './scan';
import { generateCsrInit, generateSsgInit, generateCsrMenus } from './generate';

export interface BobeRouterPluginOptions {
  dir?: string;
  ssg?: boolean;
}

export default function bobeRouter(opt: BobeRouterPluginOptions = {}): Plugin[] {
  const dir = opt.dir || 'pages';
  const ssg = opt.ssg || false;

  let root: string;

  return [{
    name: 'bobe-router',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      if (id === 'bobe-router/csr-routes') return '\0bobe-router/csr-routes';
    },

    load(id) {
      if (id === '\0bobe-router/csr-routes') {
        const absDir = resolve(root, dir);
        const { routes, menus } = scanDir(absDir, root);
        return generateCsrInit(routes) + (menus.length ? '\n' + generateCsrMenus(menus) : '');
      }
    },

    // SSR routes 直接注入到 entry-server.ts，不走虚拟模块（避免 Rollup tree-shake）
    transform(code, id) {
      if (id.includes('entry-server.ts')) {
        const absDir = resolve(root, dir);
        const { routes, menus } = scanDir(absDir, root);
        const ssg = generateSsgInit(routes) + (menus.length ? '\n' + generateCsrMenus(menus) : '');
        return ssg + '\n' + code;
      }
    }
  }];
}
