import type { Plugin } from 'vite';
import { isAbsolute, resolve } from 'path';
import { scanDir } from './scan';
import { generateCsrInit, generateSsgInit, generateCsrMenus } from './generate';

function injectImport(code: string, source: string): string {
  if (code.includes(`'${source}'`) || code.includes(`"${source}"`)) return code;
  return `import '${source}';\n` + code;
}

function normalizeEntryId(id: string, root: string): string {
  const cleanId = id.split('?')[0].replace(/\\/g, '/');
  const cleanRoot = root.replace(/\\/g, '/');
  if (cleanId.startsWith(cleanRoot + '/')) {
    return cleanId.slice(cleanRoot.length + 1);
  }
  return cleanId.replace(/^\/+/, '');
}

function normalizeConfigEntry(entry: string, root: string): string {
  const cleanEntry = entry.split('?')[0].replace(/\\/g, '/');
  const absEntry = isAbsolute(cleanEntry) ? cleanEntry : resolve(root, cleanEntry);
  return normalizeEntryId(absEntry, root);
}

function normalizeUrlEntry(url: string, root: string): string {
  const cleanUrl = url.split('?')[0].replace(/\\/g, '/').replace(/^\/+/, '');
  return normalizeEntryId(resolve(root, cleanUrl), root);
}

function collectInputEntries(input: unknown, root: string): string[] {
  const values =
    typeof input === 'string'
      ? [input]
      : Array.isArray(input)
        ? input
        : input && typeof input === 'object'
          ? Object.values(input as Record<string, unknown>)
          : [];
  return values
    .filter((entry): entry is string => typeof entry === 'string' && !entry.split('?')[0].endsWith('.html'))
    .map(entry => normalizeConfigEntry(entry, root));
}

export interface BobeRouterPluginOptions {
  dir?: string;
  ssg?: boolean;
  /** 可识别的文件后缀，默认 ['js', 'jsx', 'ts', 'tsx'] */
  extensions?: string[];
}

export default function bobeRouter(opt: BobeRouterPluginOptions = {}): Plugin[] {
  const dir = opt.dir || 'pages';
  const extensions = opt.extensions || ['js', 'jsx', 'ts', 'tsx'];
  const csrRoutesId = 'bobe-router/csr-routes';
  const ssgRoutesId = 'bobe-router/ssg-routes';
  const resolvedCsrRoutesId = '\0' + csrRoutesId;
  const resolvedSsgRoutesId = '\0' + ssgRoutesId;

  let root: string;
  let isSsrBuild = false;
  let csrEntryIds = new Set<string>();
  let ssgEntryIds = new Set<string>();

  return [{
    name: 'bobe-router',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      isSsrBuild = Boolean(config.build.ssr);
      csrEntryIds = new Set();
      ssgEntryIds = new Set();

      if (typeof config.build.ssr === 'string') {
        ssgEntryIds.add(normalizeConfigEntry(config.build.ssr, root));
      } else if (config.build.ssr) {
        ssgEntryIds = new Set(collectInputEntries(config.build.rollupOptions.input, root));
      } else {
        const libEntry = config.build.lib && typeof config.build.lib === 'object'
          ? config.build.lib.entry
          : undefined;
        csrEntryIds = new Set(collectInputEntries((config.build.rolldownOptions ?? config.build.rollupOptions).input || libEntry, root));
      }
    },

    configureServer(server) {
      const ssrLoadModule = server.ssrLoadModule.bind(server);
      server.ssrLoadModule = (url, opts) => {
        ssgEntryIds.add(normalizeUrlEntry(url, root));
        return ssrLoadModule(url, opts);
      };
    },

    resolveId(id) {
      if (id === csrRoutesId) return { id: resolvedCsrRoutesId, moduleSideEffects: true };
      if (id === ssgRoutesId) return { id: resolvedSsgRoutesId, moduleSideEffects: true };
    },

    load(id) {
      if (id === resolvedCsrRoutesId) {
        const absDir = resolve(root, dir);
        const { routes, menus } = scanDir(absDir, root, '', undefined, extensions);
        return generateCsrInit(routes) + (menus.length ? '\n' + generateCsrMenus(menus) : '');
      }
      if (id === resolvedSsgRoutesId) {
        const absDir = resolve(root, dir);
        const { routes, menus } = scanDir(absDir, root, '', undefined, extensions);
        return generateSsgInit(routes) + (menus.length ? '\n' + generateCsrMenus(menus) : '');
      }
    },

    // SSR 使用 build.ssr / rollupOptions.input 定位入口；CSR HTML 入口走 transformIndexHtml。
    // 显式 JS input 的 CSR build 会在这里注入 csr-routes。
    transform(code, id) {
      const entryId = normalizeEntryId(id, root);
      if (ssgEntryIds.has(entryId)) {
        return injectImport(code, ssgRoutesId);
      }
      if (!isSsrBuild && csrEntryIds.has(entryId)) {
        return injectImport(code, csrRoutesId);
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (isSsrBuild || html.includes(csrRoutesId)) return;
        return [{
          tag: 'script',
          attrs: { type: 'module' },
          children: `import '${csrRoutesId}';`,
          injectTo: 'head-prepend',
        }];
      }
    }
  }];
}
