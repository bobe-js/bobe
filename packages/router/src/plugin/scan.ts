import { Menu } from '#/type';
import { Dirent, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

export interface ScanItem {
  url: string;
  file: string;
  menuName?: string;
  /** routeMeta 对象字面量源文（用于嵌入生成代码） */
  metaRaw?: string;
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

/**
 * 从页面文件源文中提取 `export const routeMeta = {...}`。
 * 返回 { raw: 源文, value: 求值后的对象 }，无导出时返回 undefined。
 */
function extractRouteMeta(filePath: string): { raw: string; value: Record<string, any> } | undefined {
  try {
    const ext = filePath.split('.').pop()?.toLowerCase();

    // .md/.mdx：解析 YAML frontmatter 中的 meta 字段
    if (ext === 'md' || ext === 'mdx') {
      const content = readFileSync(filePath, 'utf-8');
      const { data } = matter(content);
      if (!data.meta || typeof data.meta !== 'object') return undefined;
      const meta = data.meta as Record<string, any>;
      return { raw: JSON.stringify(meta), value: meta };
    }

    const content = readFileSync(filePath, 'utf-8');
    // 匹配 export const routeMeta（兼容 TS 类型标注 `: SomeType`）
    const metaExportRe = /export\s+const\s+routeMeta(\s*:\s*[\w.]+(?:\s*<[^>]*>)?)?\s*=\s*/;
    const match = content.match(metaExportRe);
    if (!match) return undefined;

    const startIdx = match.index! + match[0].length;
    let braceDepth = 0;
    let inString = false;
    let stringChar: string | null = null;
    let endIdx = startIdx;

    for (let i = startIdx; i < content.length; i++) {
      const ch = content[i];
      const prev = i > 0 ? content[i - 1] : '';

      // 字符串状态跟踪，避免字符串内的括号干扰
      if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true;
        stringChar = ch;
      } else if (inString && ch === stringChar && prev !== '\\') {
        inString = false;
        stringChar = null;
      }

      if (!inString) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth--;
          if (braceDepth === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
    }

    const raw = content.slice(startIdx, endIdx).trim();
    if (!raw) return undefined;

    // 尝试求值为 JS 对象（用于 Menu）
    let value: Record<string, any> | undefined;
    try {
      value = new Function('return ' + raw)() as Record<string, any>;
    } catch {
      // 求值失败（如 import 引用），Menu 无 meta 但仍返回 raw 用于嵌入路由表
    }

    return { raw, value: value || {} };
  } catch {
    return undefined;
  }
}

/**
 * 检测文件是否有 default 导出（即有组件），还是仅导出 routeMeta。
 * .ts/.js: 检查是否有 `export default`
 * .md/.mdx: 检查 frontmatter 之后是否有实际 markdown 内容
 */
function hasDefaultExport(filePath: string): boolean {
  try {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext === 'md' || ext === 'mdx') {
      const content = readFileSync(filePath, 'utf-8');
      const { content: mdContent } = matter(content);
      return mdContent.trim().length > 0;
    }

    // .ts/.js/.tsx/.jsx：检查 export default
    const content = readFileSync(filePath, 'utf-8');
    return /export\s+default\s/.test(content);
  } catch {
    return false;
  }
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
  parentMenu?: Menu,
  extensions: string[] = DEFAULT_EXTENSIONS,
  nearestRef: { value?: { name: string; path: string } } = {}
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
    const handledName = menuName || pathPart;

    if (ent.isDirectory()) {
      const urlPath = buildUrl(parentPath, pathPart);
      const menu: Menu = {
        name: menuName || pathPart,
        hasComponent: false,
        path: urlPath,
        children: []
      };
      const child = scanDir(full, basePath, urlPath, menu, extensions, nearestRef);
      routes.push(...child.routes);
      // 自身有, 父级还没有就给父级赋值
      if (menu.nearestFile &&  parentMenu && !parentMenu.nearestFile) {
        parentMenu.nearestFile = menu.nearestFile;
      }

      menu.children = child.menus;
      menus.push(menu);
    } else if (ent.isFile()) {
      const isIndex = pathPart === 'index';
      const relFile = '/' + full.slice(basePath.length).replace(/^[/\\]/, '');
      const urlPath = buildUrl(parentPath, pathPart);

      // 提取 routeMeta
      const metaResult = extractRouteMeta(full);
      const metaRaw = metaResult?.raw;
      const meta = metaResult?.value && Object.keys(metaResult.value).length > 0 ? metaResult.value : undefined;

      // 检测是否有 default 导出（有组件 = 有路由页面）
      const hasComp = hasDefaultExport(full);

      if (isIndex) {
        const url = parentPath || '/';

        // 仅有 routeMeta 无 default 导出的文件不加入路由表
        if (hasComp) {
          routes.push({ url, file: relFile, menuName, metaRaw });
        }

        if (parentMenu) {
          // 直接修改父菜单，不走 push
          if (menuName) parentMenu.name = menuName;
          if (hasComp) {
            parentMenu.path = url;
            parentMenu.hasComponent = true;
            parentMenu.nearestFile = { name: handledName, path: url };
          }
          if (meta) parentMenu.meta = meta;
        }
        // 首页
        else if (menuName) {
          menus.push({
            name: menuName,
            path: hasComp ? '/' : undefined,
            hasComponent: hasComp,
            children: [],
            meta,
            nearestFile: hasComp ? { name: menuName, path: '/' } : undefined
          });
        }
      }
      // 非 index
      else {
        if (hasComp) {
          routes.push({ url: urlPath, file: relFile, menuName, metaRaw });
          if (parentMenu && !parentMenu.nearestFile) {
            parentMenu.nearestFile = { name: handledName, path: urlPath };
          }
        }
        if (menuName || meta) {
          menus.push({
            name: menuName || pathPart,
            path: hasComp ? urlPath : undefined,
            hasComponent: hasComp,
            meta,
            nearestFile: hasComp ? { name: handledName, path: urlPath } : undefined
          });
        }
      }
    }
  }

  return { routes, menus };
}
