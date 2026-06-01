import { scanDir } from '#/plugin/scan';
import { generateCsrInit, generateSsgInit, generateMenus } from '#/plugin/generate';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';

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
      '01#home#首页.ts': '',
      '02#about#关于.ts': '',
      '03#contact#联系我们.ts': '',
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
      '01#home#首页.ts': '',
      '02#articles#文章': '__DIR__',
      '02#articles#文章/index#.ts': '',
      '02#articles#文章/01#react#React 入门.ts': '',
      '02#articles#文章/02#vue#Vue 入门.ts': '',
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
      '01#home.ts': '',
      '02#about.ts': '',
    });

    const { routes, menus } = scanDir(TEST_DIR);

    expect(routes).toHaveLength(2);
    expect(routes[0].menuName).toBeUndefined();
    expect(menus).toHaveLength(0);
  });

  it('should handle directory without menuName', () => {
    setup(TEST_DIR, {
      '01#products': '__DIR__',
      '01#products/index#.ts': '',
      '01#products/01#detail.ts': '',
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
      '01#category.product#分类.ts': '',
    });

    const { routes } = scanDir(TEST_DIR);
    expect(routes[0].url).toBe('/category/product');
  });
});

describe('generateCsrInit', () => {
  it('should generate import() based routes', () => {
    const code = generateCsrInit([
      { url: '/', file: '/pages/index.ts' },
      { url: '/about', file: '/pages/about.ts' },
    ]);

    expect(code).toBe(
      "globalThis.__BOBE_INIT_ROUTES__ = {\n" +
      "  '/': { import: () => import('/pages/index.ts') },\n" +
      "  '/about': { import: () => import('/pages/about.ts') }\n" +
      "};"
    );
  });
});

describe('generateSsgInit', () => {
  it('should generate static import based routes', () => {
    const code = generateSsgInit([
      { url: '/', file: '/pages/index.ts' },
    ]);

    expect(code).toBe(
      "import __route_0 from '/pages/index.ts';\n\n" +
      "globalThis.__BOBE_INIT_ROUTES__ = {\n" +
      "  '/': { component: __route_0 }\n" +
      "};"
    );
  });
});
