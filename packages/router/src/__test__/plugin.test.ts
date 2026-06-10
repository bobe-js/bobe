import { scanDir } from '#/plugin/scan';
import { generateCsrInit, generateSsgInit } from '#/plugin/generate';
import { GlobalKey } from '#/global';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';

const { Routes } = GlobalKey;

const TEST_DIR = resolve(__dirname, '__plugin_test_pages');

function setup(dir: string, files: Record<string, string>) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = resolve(dir, name);
    if (content === '__DIR__') {
      mkdirSync(full, { recursive: true });
    } else {
      mkdirSync(resolve(full, '..'), { recursive: true });
      writeFileSync(full, content || 'export default {};');
    }
  }
}

function teardown(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

describe('scanDir', () => {
  beforeEach(() => teardown(TEST_DIR));
  afterAll(() => teardown(TEST_DIR));

  it('should scan flat pages with order', () => {
    setup(TEST_DIR, {
      '01_home_首页.ts': '',
      '02_about_关于.ts': '',
      '03_contact_联系我们.ts': '',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes).toHaveLength(3);
    expect(routes[0].url).toBe('/home');
    expect(routes[0].menuName).toBe('首页');
    expect(routes[1].url).toBe('/about');
    expect(routes[2].url).toBe('/contact');

    expect(menus).toHaveLength(3);
    expect(menus[0].name).toBe('首页');
    expect(menus[0].path).toBe('/home');
    expect(menus[1].name).toBe('关于');
    expect(menus[1].path).toBe('/about');
  });

  it('should handle nested directory with index', () => {
    setup(TEST_DIR, {
      '01_home_首页.ts': '',
      '02_articles_文章': '__DIR__',
      '02_articles_文章/index_.ts': '',
      '02_articles_文章/01_react_React 入门.ts': '',
      '02_articles_文章/02_vue_Vue 入门.ts': '',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes).toHaveLength(4);
    expect(routes.map(r => r.url)).toContain('/home');
    expect(routes.map(r => r.url)).toContain('/articles');
    expect(routes.map(r => r.url)).toContain('/articles/react');
    expect(routes.map(r => r.url)).toContain('/articles/vue');

    expect(menus).toHaveLength(2);
    expect(menus[0].name).toBe('首页');
    expect(menus[1].name).toBe('文章');
    expect(menus[1].path).toBe('/articles');
    expect(menus[1].children).toHaveLength(2);
    expect(menus[1].children![0].name).toBe('React 入门');
    expect(menus[1].children![0].path).toBe('/articles/react');
  });

  it('should handle missing menuName', () => {
    setup(TEST_DIR, {
      '01_home.ts': '',
      '02_about.ts': '',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes).toHaveLength(2);
    expect(routes[0].menuName).toBeUndefined();
    expect(menus).toHaveLength(0);
  });

  it('should handle directory without menuName', () => {
    setup(TEST_DIR, {
      '01_products': '__DIR__',
      '01_products/index_.ts': '',
      '01_products/01_detail.ts': '',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes.map(r => r.url)).toContain('/products');
    expect(routes.map(r => r.url)).toContain('/products/detail');
    expect(menus[0].name).toBe('products');
  });

  it('should handle empty directory', () => {
    setup(TEST_DIR, {});
    const { routes, menus } = scanDir(TEST_DIR);
    expect(routes).toHaveLength(0);
    expect(menus).toHaveLength(0);
  });

  it('should convert dot in pathPart to slash', () => {
    setup(TEST_DIR, {
      '01_category.product_分类.ts': '',
    });

    const { routes } = scanDir(TEST_DIR);
    expect(routes[0].url).toBe('/category/product');
  });

  it('should extract routeMeta from page file', () => {
    setup(TEST_DIR, {
      '01_home_首页.ts': "export const routeMeta = { title: '首页', auth: true };\nexport default {};",
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes[0].metaRaw).toBe("{ title: '首页', auth: true }");
    expect(menus[0].meta).toEqual({ title: '首页', auth: true });
  });

  it('should handle page without routeMeta', () => {
    setup(TEST_DIR, {
      '01_home_首页.ts': 'export default {};',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes[0].metaRaw).toBeUndefined();
    expect(menus[0].meta).toBeUndefined();
  });

  it('should handle routeMeta with TypeScript type annotation', () => {
    setup(TEST_DIR, {
      '01_home_首页.ts': "export const routeMeta: RouteMeta = { title: '首页' };\nexport default {};",
    });

    const { routes } = scanDir(TEST_DIR);

    expect(routes[0].metaRaw).toBe("{ title: '首页' }");
  });

  it('should extract routeMeta from .md YAML frontmatter', () => {
    setup(TEST_DIR, {
      '01_article_文章.md': '---\nmeta:\n  title: 文章标题\n  auth: true\n---\n# Hello',
    });

    const { routes, menus } = scanDir(TEST_DIR, TEST_DIR, '', undefined, ['js', 'ts', 'md']);

    expect(routes[0].metaRaw).toBe('{"title":"文章标题","auth":true}');
    expect(menus[0].meta).toEqual({ title: '文章标题', auth: true });
  });

  it('should handle .md without frontmatter', () => {
    setup(TEST_DIR, {
      '01_article_文章.md': '# Just markdown',
    });

    const { routes, menus } = scanDir(TEST_DIR, TEST_DIR, '', undefined, ['js', 'ts', 'md']);

    expect(routes[0].metaRaw).toBeUndefined();
    expect(menus[0].meta).toBeUndefined();
  });

  it('should skip route table for .ts file with only routeMeta (no default export)', () => {
    setup(TEST_DIR, {
      '01_meta-only_元信息.ts': "export const routeMeta = { title: '仅元信息' };",
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes).toHaveLength(0);
    expect(menus).toHaveLength(1);
    expect(menus[0].name).toBe('元信息');
    expect(menus[0].hasComponent).toBe(false);
    expect(menus[0].path).toBeUndefined();
    expect(menus[0].meta).toEqual({ title: '仅元信息' });
  });

  it('should skip route table for directory index.ts with only routeMeta', () => {
    setup(TEST_DIR, {
      '01_articles_文章': '__DIR__',
      '01_articles_文章/index_.ts': "export const routeMeta = { title: '文章目录', icon: 'folder' };",
    });

    const { routes, menus } = scanDir(TEST_DIR);

    // 无路由（index.ts 无 default 导出）
    expect(routes).toHaveLength(0);
    // 目录菜单有 meta，hasComponent = false
    expect(menus).toHaveLength(1);
    expect(menus[0].name).toBe('文章');
    expect(menus[0].hasComponent).toBe(false);
    expect(menus[0].meta).toEqual({ title: '文章目录', icon: 'folder' });
  });

  it('should handle .md with only frontmatter and no content', () => {
    setup(TEST_DIR, {
      '01_meta_元信息.md': '---\nmeta:\n  title: 纯元信息\n---\n',
    });

    const { routes, menus } = scanDir(TEST_DIR, TEST_DIR, '', undefined, ['js', 'ts', 'md']);

    // 无 markdown 内容 = 无组件 → 不入路由表
    expect(routes).toHaveLength(0);
    expect(menus).toHaveLength(1);
    expect(menus[0].name).toBe('元信息');
    expect(menus[0].hasComponent).toBe(false);
    expect(menus[0].meta).toEqual({ title: '纯元信息' });
  });
});

describe('generateCsrInit', () => {
  it('should generate import() based routes', () => {
    const code = generateCsrInit([
      { url: '/', file: '/pages/index.ts' },
      { url: '/about', file: '/pages/about.ts' },
    ]);

    expect(code).toBe(
      `globalThis['${Routes}'] = {\n` +
      "  '/': { import: () => import('/pages/index.ts') },\n" +
      "  '/about': { import: () => import('/pages/about.ts') }\n" +
      "};"
    );
  });

  it('should keep _ in import paths (URL-safe)', () => {
    const code = generateCsrInit([
      { url: '/home', file: '/pages/01_home_首页.ts' },
    ]);

    expect(code).toBe(
      `globalThis['${Routes}'] = {\n` +
      "  '/home': { import: () => import('/pages/01_home_首页.ts') }\n" +
      "};"
    );
  });

  it('should include meta when metaRaw is provided', () => {
    const code = generateCsrInit([
      { url: '/', file: '/pages/index.ts', metaRaw: "{ title: '首页' }" },
    ]);

    expect(code).toContain("meta: { title: '首页' }");
  });
});

describe('generateSsgInit', () => {
  it('should generate static import based routes', () => {
    const code = generateSsgInit([
      { url: '/', file: '/pages/index.ts' },
    ]);

    expect(code).toBe(
      "import * as __module_0 from '/pages/index.ts';\n\n" +
      `globalThis['${Routes}'] = {\n` +
      "  '/': { component: __module_0.default, layout: __module_0.layout }\n" +
      "};\n" +
      "export const __bobe_routes = [__module_0.default];"
    );
  });

  it('should keep _ in static import paths (URL-safe)', () => {
    const code = generateSsgInit([
      { url: '/home', file: '/pages/01_home_首页.ts' },
    ]);

    expect(code).toContain("import * as __module_0 from '/pages/01_home_首页.ts';");
  });

  it('should include meta when metaRaw is provided', () => {
    const code = generateSsgInit([
      { url: '/', file: '/pages/index.ts', metaRaw: "{ title: '首页' }" },
    ]);

    expect(code).toContain("meta: { title: '首页' }");
  });
});
