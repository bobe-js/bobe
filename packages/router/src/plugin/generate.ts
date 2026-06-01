import { Menu } from '#/type';
import type { ScanItem } from './scan';

/** CSR：HTML 注入用 import() 动态导入 */
export function generateCsrInit(items: ScanItem[]): string {
  const entries = items.map(({ url, file }) =>
    `  '${url}': { import: () => import('${file}') }`
  );
  return 'globalThis.__BOBE_INIT_ROUTES__ = {\n' + entries.join(',\n') + '\n};';
}

/** SSG：SSR 虚拟模块用静态 import */
export function generateSsgInit(items: ScanItem[]): string {
  const imports = items.map(({ file }, i) =>
    `import __route_${i} from '${file}';`
  );
  const entries = items.map(({ url }, i) =>
    `  '${url}': { component: __route_${i} }`
  );
  return imports.join('\n') + '\n\nglobalThis.__BOBE_INIT_ROUTES__ = {\n' + entries.join(',\n') + '\n};';
}

/** 虚拟模块 virtual:bobe-menus 代码 */
export function generateMenus(menus: Menu[]): string {
  return `export const menus = ${JSON.stringify(menus, null, 2)};`;
}
