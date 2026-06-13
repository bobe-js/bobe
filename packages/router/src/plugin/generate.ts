import { GlobalKey } from '#/global';
import { Menu } from '#/type';
import type { ScanItem } from './scan';

const { Routes, Menus } = GlobalKey;

export function generateCsrInit(items: ScanItem[]): string {
  const entries = items.map(({ url, file, metaRaw }) => {
    const metaPart = metaRaw ? `, meta: ${metaRaw}` : '';
    return `  '${url}': { import: () => import('${file}')${metaPart} }`;
  });
  return `globalThis['${Routes}'] = {\n` + entries.join(',\n') + '\n};';
}

export function generateSsgInit(items: ScanItem[]): string {
  const imports = items.map(({ file }, i) =>
    `import * as __module_${i} from '${file}';`
  );
  const names = items.map((_, i) => `__module_${i}.default`);
  const entries = items.map(({ url, metaRaw, hasLayout }, i) => {
    const metaPart = metaRaw ? `, meta: ${metaRaw}` : '';
    const layoutPart = hasLayout ? `, layout: __module_${i}.layout` : '';
    return `  '${url}': { component: __module_${i}.default${layoutPart}${metaPart} }`;
  });
  return imports.join('\n')
    + `\n\nglobalThis['${Routes}'] = {\n` + entries.join(',\n') + '\n};'
    + `\nexport const __bobe_routes = [${names.join(', ')}];`;
}

export function generateCsrMenus(menus: Menu[]): string {
  return `globalThis['${Menus}'] = ${JSON.stringify(menus)};`;
}
