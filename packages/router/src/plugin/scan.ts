import { Menu } from '#/type';
import { Dirent, readdirSync } from 'fs';
import { join } from 'path';

export interface ScanItem {
  url: string;
  file: string;
  menuName?: string;
}

const RE_DIR = /^(?:(\d+)_)?([^_]+?)(?:_(.+?))?$/;

const DEFAULT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx'];

function buildFileRegex(extensions: string[]): RegExp {
  const exts = extensions.map(e => e.replace(/^\./, '')).join('|');
  return new RegExp(`^(?:(\\d+)_)?([^_]+?)(?:_(.*))?\\.(${exts})$`);
}

function buildUrl(base: string, part: string): string {
  return (base === '/' ? '' : base) + '/' + part.replace(/\./g, '/');
}

function parseEntry(name: string, fileRe: RegExp): { order: number; pathPart: string; menuName?: string } | null {
  const dirMatch = name.match(RE_DIR);
  const isDir = !name.includes('.');

  if (isDir && dirMatch) {
    const [, orderStr, pathPart, menuName] = dirMatch;
    return { order: orderStr ? parseInt(orderStr, 10) : Infinity, pathPart, menuName };
  }

  const fileMatch = name.match(fileRe);
  if (fileMatch) {
    const [, orderStr, pathPart, menuName] = fileMatch;
    return { order: orderStr ? parseInt(orderStr, 10) : Infinity, pathPart, menuName };
  }

  return null;
}

function sortEntries(entries: Dirent[], fileRe: RegExp): Dirent[] {
  return entries.sort((a, b) => {
    const pa = parseEntry(a.name, fileRe);
    const pb = parseEntry(b.name, fileRe);
    const oa = pa?.order ?? Infinity;
    const ob = pb?.order ?? Infinity;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
}

export function scanDir(
  absDir: string,
  basePath = absDir,
  parentPath = '',
  menuRef?: Menu,
  extensions: string[] = DEFAULT_EXTENSIONS
): { routes: ScanItem[]; menus: Menu[] } {
  const routes: ScanItem[] = [];
  const menus: Menu[] = [];
  let entries: Dirent[];
  const fileRe = buildFileRegex(extensions);

  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return { routes, menus };
  }

  entries = sortEntries(entries, fileRe);

  for (const ent of entries) {
    const full = join(absDir, ent.name);
    const parsed = parseEntry(ent.name, fileRe);
    if (!parsed) continue;

    const { pathPart, menuName } = parsed;

    if (ent.isDirectory()) {
      const urlPath = buildUrl(parentPath, pathPart);
      const menu: Menu = {
        name: menuName || pathPart,
        hasComponent: false,
        children: []
      };
      const child = scanDir(full, basePath, urlPath, menu, extensions);
      routes.push(...child.routes);
      menu.children = child.menus;
      menus.push(menu);
    } else if (ent.isFile()) {
      const isIndex = pathPart === 'index';
      const relFile = '/' + full.slice(basePath.length).replace(/^[/\\]/, '');
      const urlPath = buildUrl(parentPath, pathPart);

      if (isIndex) {
        const url = parentPath || '/';
        routes.push({ url, file: relFile, menuName });
        if (menuRef) {
          // 直接修改父菜单，不走 push
          if (menuName) menuRef.name = menuName;
          menuRef.path = url;
          menuRef.hasComponent = true;
        } else if (menuName) {
          menus.push({ name: menuName, path: '/', hasComponent: true, children: [] });
        }
      } else {
        routes.push({ url: urlPath, file: relFile, menuName });
        if (menuName) menus.push({ name: menuName, path: urlPath, hasComponent: true });
      }
    }
  }

  return { routes, menus };
}
