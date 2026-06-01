import type { Plugin } from 'vite';
import { resolve } from 'path';
import { scanDir } from './scan';
import { generateCsrInit, generateSsgInit, generateMenus } from './generate';

export interface BobeRouterPluginOptions {
  /** pages 目录（相对项目根），默认 'pages' */
  dir?: string;
  /** true=SSG(component), false=CSR(import) */
  ssg?: boolean;
}

export default function bobeRouter(opt: BobeRouterPluginOptions = {}): Plugin[] {
  const dir = opt.dir || 'pages';
  const ssg = opt.ssg || false;

  let root: string;

  return [{
    name: 'bobe-router',
    configResolved(config) {
      root = config.root;
    },

    // CSR：自动注入到 HTML <head>
    transformIndexHtml() {
      if (ssg) return;
      const absDir = resolve(root, dir);
      const { routes } = scanDir(absDir);
      if (!routes.length) return;
      return [{
        tag: 'script',
        attrs: { type: 'module' },
        children: generateCsrInit(routes),
        injectTo: 'head-prepend' as const
      }];
    },

    resolveId(id) {
      if (id === 'bobe-router/ssr-routes') return '\0bobe-router/ssr-routes';
      if (id === 'virtual:bobe-menus')     return '\0virtual:bobe-menus';
    },

    load(id) {
      const absDir = resolve(root, dir);

      if (id === '\0bobe-router/ssr-routes') {
        const { routes } = scanDir(absDir);
        return generateSsgInit(routes);
      }

      if (id === '\0virtual:bobe-menus') {
        const { menus } = scanDir(absDir);
        return generateMenus(menus);
      }
    }
  }];
}
