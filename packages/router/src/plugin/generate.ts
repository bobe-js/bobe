import { GlobalKey } from '#/global';
import { Menu } from '#/type';
import type { ScanItem } from './scan';

const { Routes, Menus } = GlobalKey;

export function generateCsrInit(items: ScanItem[]): string {
  const entries = items.map(({ url, file }) =>
    `  '${url}': { import: () => import('${file}') }`
  );
  return `globalThis['${Routes}'] = {\n` + entries.join(',\n') + '\n};';
}

export function generateSsgInit(items: ScanItem[]): string {
  const imports = items.map(({ file }, i) =>
    `import __route_${i} from '${file}';`
  );
  const names = items.map((_, i) => `__route_${i}`);
  const entries = items.map(({ url }, i) =>
    `  '${url}': { component: __route_${i} }`
  );
  return imports.join('\n')
    + `\n\nglobalThis['${Routes}'] = {\n` + entries.join(',\n') + '\n};'
    + `\nexport const __bobe_routes = [${names.join(', ')}];`;
}

export function generateCsrMenus(menus: Menu[]): string {
  return `globalThis['${Menus}'] = ${JSON.stringify(menus)};`;
}
