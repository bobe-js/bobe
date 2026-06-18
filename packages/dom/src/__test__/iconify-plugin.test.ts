import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createIconifyVirtualModule,
  extractBobeIconifyIcons,
  loadIconifyCollections,
} from '../plugins/iconify';

describe('iconify plugin helpers', () => {
  it('extracts static iconify-icon usage from bobe templates', () => {
    const result = extractBobeIconifyIcons(`
      import { bobe } from 'bobe';

      const one = bobe\`
        div
          iconify-icon icon="lucide:search"
          iconify-icon
          | icon='lucide:x'
      \`;

      const two = bobe\`
        iconify-icon class="size-4" icon="mdi:home"
      \`;
    `);

    expect(result.icons).toEqual(['lucide:search', 'lucide:x', 'mdi:home']);
    expect(result.dynamic).toBe(0);
    expect(result.invalid).toEqual([]);
  });

  it('reports dynamic and invalid icon usage without collecting it', () => {
    const result = extractBobeIconifyIcons(`
      import { bobe } from 'bobe';

      export const ui = bobe\`
        iconify-icon icon={name}
        iconify-icon icon="lucide:\${name}"
        iconify-icon icon="bad icon"
      \`;
    `);

    expect(result.icons).toEqual([]);
    expect(result.dynamic).toBe(2);
    expect(result.invalid).toEqual(['bad icon']);
  });

  it('uses cached collections and only downloads missing icons', async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'bobe-iconify-'));
    try {
      await writeFile(
        path.join(cacheDir, 'lucide.json'),
        JSON.stringify({
          prefix: 'lucide',
          icons: {
            search: { body: '<path d="search" />' },
          },
        }),
        'utf8'
      );

      const requested: string[] = [];
      const collections = await loadIconifyCollections(['lucide:search', 'lucide:x'], {
        apiBase: 'https://api.iconify.test',
        cacheDir,
        fetcher: (async (url: string) => {
          requested.push(url);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              prefix: 'lucide',
              icons: {
                x: { body: '<path d="x" />' },
              },
            }),
          };
        }) as any,
      });

      expect(requested).toEqual(['https://api.iconify.test/lucide.json?icons=x']);
      expect(collections.lucide.icons.search).toEqual({ body: '<path d="search" />' });
      expect(collections.lucide.icons.x).toEqual({ body: '<path d="x" />' });

      const cached = JSON.parse(await readFile(path.join(cacheDir, 'lucide.json'), 'utf8'));
      expect(cached.icons).toMatchObject({
        search: { body: '<path d="search" />' },
        x: { body: '<path d="x" />' },
      });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('generates iconify web component registration code', () => {
    const code = createIconifyVirtualModule(
      new Map([['lucide', new Set(['search'])]]),
      {
        lucide: {
          prefix: 'lucide',
          icons: {
            search: { body: '<path d="search" />' },
          },
        },
      }
    );

    expect(code).toContain(`import "iconify-icon";`);
    expect(code).toContain(`import { addIcon } from "iconify-icon";`);
    expect(code).toContain(`import { getIconData } from "@iconify/utils";`);
    expect(code).toContain(`addIcon(prefix + ':' + name, data);`);
    expect(code).toContain('"search"');
  });
});
