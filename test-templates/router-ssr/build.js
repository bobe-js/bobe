import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distClient = path.resolve(__dirname, 'dist/client');

// 1. 加载 SSR entry（此时 globalThis.__BOBE_INIT_ROUTES__ 被赋值）
const serverEntry = await import('./dist/server/entry-server.js');

// 2. 获取路由表
const routes = globalThis.__BOBE_INIT_ROUTES__;
if (!routes || Object.keys(routes).length === 0) {
  console.error('❌ No routes found in globalThis.__BOBE_INIT_ROUTES__');
  process.exit(1);
}

// 3. 读取 Vite 构建后的 HTML 模板
const template = await fs.readFile(path.join(distClient, 'index.html'), 'utf-8');

// 4. 逐路由渲染
console.log(`\n🔨 Generating static pages for ${Object.keys(routes).length} routes...\n`);

for (const [url] of Object.entries(routes)) {
  const html = await serverEntry.render(url);
  const page = template.replace('<!--app-html-->', html);

  const outDir = path.join(distClient, url);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), page);
  console.log(`  ✅ ${url} → ${path.join(url, 'index.html')}`);
}

console.log('\n🎉 SSG build complete!\n');
