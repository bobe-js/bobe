import { Menu } from '#/type';
import { Dirent, readdirSync } from 'fs';
import { join } from 'path';

export interface ScanItem {
  url: string;
  file: string;
  menuName?: string;
}

const RE_FILE = /^(?:(\d+)_)?([^_]+?)(?:_(.*))?\.(ts|tsx|js|jsx)$/;
const RE_DIR = /^(?:(\d+)_)?([^_]+?)(?:_(.+?))?$/;

function buildUrl(base: string, part: string): string {
  return (base === '/' ? '' : base) + '/' + part.replace(/\./g, '/');
}

function parseEntry(name: string): { order: number; pathPart: string; menuName?: string } | null {
  const dirMatch = name.match(RE_DIR);
  const isDir = !name.includes('.');

  if (isDir && dirMatch) {
    const [, orderStr, pathPart, menuName] = dirMatch;
    return { order: orderStr ? parseInt(orderStr, 10) : Infinity, pathPart, menuName };
  }

  const fileMatch = name.match(RE_FILE);
  if (fileMatch) {
    const [, orderStr, pathPart, menuName] = fileMatch;
    return { order: orderStr ? parseInt(orderStr, 10) : Infinity, pathPart, menuName };
  }

  return null;
}

function sortEntries(entries: Dirent[]): Dirent[] {
  return entries.sort((a, b) => {
    const pa = parseEntry(a.name);
    const pb = parseEntry(b.name);
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
  menuRef?: Menu
): { routes: ScanItem[]; menus: Menu[] } {
  const routes: ScanItem[] = [];
  const menus: Menu[] = [];
  let entries: Dirent[];

  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return { routes, menus };
  }

  entries = sortEntries(entries);

  for (const ent of entries) {
    const full = join(absDir, ent.name);
    const parsed = parseEntry(ent.name);
    if (!parsed) continue;

    const { pathPart, menuName } = parsed;

    if (ent.isDirectory()) {
      const urlPath = buildUrl(parentPath, pathPart);
      const menu: Menu = {
        name: menuName || pathPart,
        hasComponent: false,
        children: []
      };
      const child = scanDir(full, basePath, urlPath, menu);
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
