import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { parse } from '@babel/parser';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const VIRTUAL_ID = 'virtual:bobe-iconify-icons';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const DEFAULT_API_BASE = 'https://api.iconify.design';
const DEFAULT_CACHE_DIR = 'bobe-iconify';
const DEFAULT_EXTENSIONS_RE = /\.(?:[cm]?[jt]sx?|mdx?)$/;
const ICON_NAME_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+[-_:.a-z0-9]*)$/i;
const ICON_ATTR_RE = /\bicon\s*=\s*(['"])([^'"]+)\1/g;
const DYNAMIC_ICON_RE = /\bicon\s*=\s*(?:\{|(['"])[^'"]*$)/;
const require = createRequire(import.meta.url);

export interface BobeIconifyPluginOptions {
  include?: string | string[];
  exclude?: string | string[];
  icons?: string[];
  apiBase?: string;
  cacheDir?: string;
  strict?: boolean;
  warnDynamic?: boolean;
}

export interface ExtractBobeIconifyResult {
  icons: string[];
  dynamic: number;
  invalid: string[];
}

interface IconifyJSON {
  prefix: string;
  icons: Record<string, unknown>;
  aliases?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CollectionLoadOptions {
  apiBase: string;
  cacheDir: string;
  strict?: boolean;
  fetcher?: typeof fetch;
  warn?: (message: string) => void;
}

interface RuntimeImportPaths {
  iconifyIcon: string;
  iconifyUtils: string;
}

export default function bobeIconifyPlugin(options: BobeIconifyPluginOptions = {}): Plugin {
  const icons = new Set<string>();
  const warnedDynamicIds = new Set<string>();
  const warnedInvalid = new Set<string>();
  const filter = createFilter(options.include, options.exclude);
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  let projectScanned = false;
  let runtimeImports: RuntimeImportPaths;

  const addIcons = (items: Iterable<string>) => {
    let changed = false;
    for (const icon of items) {
      if (icons.has(icon)) continue;
      icons.add(icon);
      changed = true;
    }
    if (changed && server) {
      const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
  };

  const scanCode = (code: string, id: string, warn: (message: string) => void) => {
    const result = extractBobeIconifyIcons(code);
    addIcons(result.icons);

    if (options.warnDynamic !== false && result.dynamic > 0 && !warnedDynamicIds.has(id)) {
      warnedDynamicIds.add(id);
      warn(`[bobe-iconify] ${id} 中存在动态 iconify-icon icon 属性，插件会跳过静态注册并保留 Iconify runtime fallback。如需本地注册，请通过 icons 配置补充。`);
    }

    for (const icon of result.invalid) {
      const key = `${id}:${icon}`;
      if (warnedInvalid.has(key)) continue;
      warnedInvalid.add(key);
      warn(`[bobe-iconify] 忽略非法 icon 名称 "${icon}"，仅支持 "prefix:name"。来源：${id}`);
    }
  };

  return {
    name: 'bobe-iconify',

    configResolved(resolved) {
      config = resolved;
      runtimeImports = resolveRuntimeImports();
      addIcons(normalizeIconList(options.icons || []));
    },

    configureServer(devServer) {
      server = devServer;
    },

    async buildStart() {
      addIcons(normalizeIconList(options.icons || []));
    },

    async transform(code, id) {
      if (!filter(id)) return;
      scanCode(code, id, message => this.warn(message));
    },

    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (config?.build?.ssr) return;
        return [
          {
            tag: 'script',
            attrs: { type: 'module', src: `/${VIRTUAL_ID}` },
            injectTo: 'head',
          },
        ];
      },
    },

    resolveId(id) {
      if (id === VIRTUAL_ID || id === `/${VIRTUAL_ID}`) return RESOLVED_VIRTUAL_ID;
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;

      await scanProjectOnce();
      const cacheDir = getCacheDir(config, options);
      const collections = await loadIconifyCollections(icons, {
        apiBase: options.apiBase || DEFAULT_API_BASE,
        cacheDir,
        strict: options.strict,
        warn: message => this.warn(message),
      });

      return createIconifyVirtualModule(groupIconsByPrefix(icons), collections, runtimeImports);
    },
  };

  async function scanProjectOnce() {
    if (projectScanned || !config) return;
    projectScanned = true;

    const files = await collectSourceFiles(config.root);
    await Promise.all(files.map(async file => {
      const id = path.normalize(file);
      if (!filter(id) || id.endsWith('.md') || id.endsWith('.mdx')) return;
      try {
        const code = await fs.readFile(file, 'utf8');
        scanCode(code, id, message => config.logger.warn(message));
      } catch {
        // Ignore unreadable files during eager project scan. Vite transform still handles modules in graph.
      }
    }));
  }
}

export function extractBobeIconifyIcons(code: string): ExtractBobeIconifyResult {
  const icons = new Set<string>();
  const invalid = new Set<string>();
  let dynamic = 0;

  let ast: any;
  try {
    ast = parse(code, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: [
        'typescript',
        'jsx'
      ],
    });
  } catch {
    return { icons: [], dynamic: 0, invalid: [] };
  }

  walkAst(ast, node => {
    if (node.type !== 'TaggedTemplateExpression' || !isBobeTag(node.tag)) return;

    for (const quasi of node.quasi?.quasis || []) {
      const raw = quasi.value?.raw ?? quasi.value?.cooked ?? '';
      const result = extractIconifyIconsFromTemplate(raw);
      for (const icon of result.icons) icons.add(icon);
      for (const icon of result.invalid) invalid.add(icon);
      dynamic += result.dynamic;
    }
  });

  return {
    icons: Array.from(icons).sort(),
    dynamic,
    invalid: Array.from(invalid).sort(),
  };
}

export function extractIconifyIconsFromTemplate(template: string): ExtractBobeIconifyResult {
  const icons = new Set<string>();
  const invalid = new Set<string>();
  let dynamic = 0;
  let inIconifyElement = false;

  for (const line of template.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const isContinuation = trimmed.startsWith('|');
    const isIconifyElement = /^<?iconify-icon\b/.test(trimmed);
    if (!isContinuation) inIconifyElement = isIconifyElement;

    if (!isIconifyElement && !(inIconifyElement && isContinuation)) continue;

    for (const icon of extractStaticIconAttributes(trimmed)) {
      if (isValidIconName(icon)) {
        icons.add(icon);
      } else {
        invalid.add(icon);
      }
    }

    if (DYNAMIC_ICON_RE.test(trimmed)) dynamic++;
  }

  return {
    icons: Array.from(icons).sort(),
    dynamic,
    invalid: Array.from(invalid).sort(),
  };
}

export async function loadIconifyCollections(iconNames: Iterable<string>, options: CollectionLoadOptions) {
  const grouped = groupIconsByPrefix(iconNames);
  const collections: Record<string, IconifyJSON> = {};
  await fs.mkdir(options.cacheDir, { recursive: true });

  for (const [prefix, names] of grouped) {
    const cacheFile = path.join(options.cacheDir, `${prefix}.json`);
    const cached = await readCachedCollection(cacheFile, prefix);
    const missing = Array.from(names).filter(name => !hasIcon(cached, name));
    let collection = cached;

    if (missing.length) {
      const remote = await fetchIconifyCollection(prefix, missing, options);
      if (remote) {
        collection = mergeCollections(prefix, cached, remote);
        await fs.writeFile(cacheFile, JSON.stringify(collection, null, 2), 'utf8');
      }
    }

    collections[prefix] = collection;
  }

  return collections;
}

export function createIconifyVirtualModule(
  iconsByPrefix: Map<string, Set<string>>,
  collections: Record<string, IconifyJSON>,
  runtimeImports: RuntimeImportPaths = {
    iconifyIcon: 'iconify-icon',
    iconifyUtils: '@iconify/utils',
  }
) {
  const icons = Object.fromEntries(
    Array.from(iconsByPrefix, ([prefix, names]) => [prefix, Array.from(names).sort()])
  );

  return [
    `import ${JSON.stringify(toImportPath(runtimeImports.iconifyIcon))};`,
    `import { addIcon } from ${JSON.stringify(toImportPath(runtimeImports.iconifyIcon))};`,
    `import { getIconData } from ${JSON.stringify(toImportPath(runtimeImports.iconifyUtils))};`,
    `const collections = ${JSON.stringify(collections)};`,
    `const icons = ${JSON.stringify(icons)};`,
    `for (const prefix of Object.keys(icons)) {`,
    `  const collection = collections[prefix];`,
    `  if (!collection) continue;`,
    `  for (const name of icons[prefix]) {`,
    `    const data = getIconData(collection, name);`,
    `    if (data) addIcon(prefix + ':' + name, data);`,
    `  }`,
    `}`,
    ``,
  ].join('\n');
}

export function groupIconsByPrefix(iconNames: Iterable<string>) {
  const grouped = new Map<string, Set<string>>();
  for (const iconName of normalizeIconList(iconNames)) {
    const match = ICON_NAME_RE.exec(iconName);
    if (!match) continue;
    const [, prefix, name] = match;
    if (!grouped.has(prefix)) grouped.set(prefix, new Set());
    grouped.get(prefix)!.add(name);
  }
  return grouped;
}

function extractStaticIconAttributes(line: string) {
  const icons: string[] = [];
  ICON_ATTR_RE.lastIndex = 0;
  let match = ICON_ATTR_RE.exec(line);
  while (match) {
    icons.push(match[2].trim());
    match = ICON_ATTR_RE.exec(line);
  }
  return icons;
}

function isValidIconName(icon: string) {
  return ICON_NAME_RE.test(icon);
}

function normalizeIconList(iconNames: Iterable<string>) {
  return Array.from(iconNames)
    .map(icon => String(icon).trim())
    .filter(Boolean)
    .filter(isValidIconName)
    .sort();
}

function isBobeTag(tag: any) {
  if (!tag) return false;
  if (tag.type === 'Identifier') return tag.name === 'bobe';
  if (tag.type === 'MemberExpression') {
    const property = tag.property;
    return !tag.computed && property?.type === 'Identifier' && property.name === 'bobe';
  }
  return false;
}

function walkAst(node: any, visit: (node: any) => void) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit);
    } else if (value && typeof value === 'object') {
      walkAst(value, visit);
    }
  }
}

function createFilter(include?: string | string[], exclude?: string | string[]) {
  const includeMatchers = normalizeMatchers(include);
  const excludeMatchers = normalizeMatchers(exclude);

  return (id: string) => {
    const normalized = normalizeId(id);
    if (excludeMatchers.some(match => match(normalized))) return false;
    if (includeMatchers.length) return includeMatchers.some(match => match(normalized));
    return DEFAULT_EXTENSIONS_RE.test(normalized) && !normalized.includes('/node_modules/') && !normalized.includes('/dist/');
  };
}

function normalizeMatchers(value?: string | string[]) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(toMatcher);
}

function toMatcher(pattern: string) {
  const normalized = normalizeId(pattern);
  if (!normalized.includes('*')) return (id: string) => id.includes(normalized);
  const source = normalized
    .split('*')
    .map(escapeRegExp)
    .join('.*');
  const re = new RegExp(source);
  return (id: string) => re.test(id);
}

function normalizeId(id: string) {
  return id.split('?')[0].replace(/\\/g, '/');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectSourceFiles(root: string) {
  const files: string[] = [];
  await walkDir(root, files);
  return files;
}

async function walkDir(dir: string, files: string[]) {
  const base = path.basename(dir);
  if (base === 'node_modules' || base === 'dist' || base === '.git') return;

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(entries.map(async entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, files);
      return;
    }
    if (entry.isFile() && DEFAULT_EXTENSIONS_RE.test(entry.name)) files.push(fullPath);
  }));
}

async function readCachedCollection(file: string, prefix: string): Promise<IconifyJSON> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.prefix === prefix && parsed.icons && typeof parsed.icons === 'object') {
      return parsed;
    }
  } catch {
    // Missing or invalid cache is treated as an empty collection.
  }

  return { prefix, icons: {} };
}

async function fetchIconifyCollection(prefix: string, names: string[], options: CollectionLoadOptions) {
  const fetcher = options.fetcher || globalThis.fetch;
  if (typeof fetcher !== 'function') {
    return handleFetchFailure(prefix, names, options, new Error('global fetch is not available'));
  }

  const url = `${options.apiBase.replace(/\/$/, '')}/${prefix}.json?icons=${names.map(encodeURIComponent).join(',')}`;
  try {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json?.icons || typeof json.icons !== 'object') throw new Error('invalid Iconify response');
    return json as IconifyJSON;
  } catch (error) {
    return handleFetchFailure(prefix, names, options, error);
  }
}

function handleFetchFailure(prefix: string, names: string[], options: CollectionLoadOptions, error: unknown) {
  const message = `[bobe-iconify] 下载 ${prefix}:${names.join(',')} 失败，已保留 Iconify runtime fallback。${error instanceof Error ? error.message : String(error)}`;
  if (options.strict) throw new Error(message);
  options.warn?.(message);
  return null;
}

function mergeCollections(prefix: string, cached: IconifyJSON, remote: IconifyJSON): IconifyJSON {
  return {
    ...cached,
    ...remote,
    prefix,
    icons: {
      ...(cached.icons || {}),
      ...(remote.icons || {}),
    },
    aliases: mergeOptionalRecords(cached.aliases, remote.aliases),
  };
}

function mergeOptionalRecords(a?: Record<string, unknown>, b?: Record<string, unknown>) {
  const merged = { ...(a || {}), ...(b || {}) };
  return Object.keys(merged).length ? merged : undefined;
}

function hasIcon(collection: IconifyJSON, name: string) {
  return Boolean(collection.icons?.[name] || collection.aliases?.[name]);
}

function getCacheDir(config: ResolvedConfig, options: BobeIconifyPluginOptions) {
  if (options.cacheDir) {
    return path.isAbsolute(options.cacheDir)
      ? options.cacheDir
      : path.resolve(config.root, options.cacheDir);
  }
  return path.resolve(config.cacheDir, DEFAULT_CACHE_DIR);
}

function resolveRuntimeImports(): RuntimeImportPaths {
  return {
    iconifyIcon: requireResolve('iconify-icon/dist/iconify-icon.mjs'),
    iconifyUtils: requireResolve('@iconify/utils'),
  };
}

function requireResolve(id: string) {
  return require.resolve(id);
}

function toImportPath(id: string) {
  return id.replace(/\\/g, '/');
}
