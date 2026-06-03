import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfig, createPlugins } from '../../config/rollup.js';
import dts from 'rollup-plugin-dts';
import alias from '@rollup/plugin-alias';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')))

// 基础构建（src/index.ts）
const base = createConfig(pkg, __dirname);

// markdown 插件构建
const markdownJs = {
  input: 'src/plugins/markdown/index.ts',
  output: [
    { file: 'dist/markdown.cjs.js', format: 'cjs', sourcemap: true },
    { file: 'dist/markdown.esm.js', format: 'esm', sourcemap: true }
  ],
  plugins: createPlugins(pkg, __dirname),
  external: [...Object.keys(pkg.dependencies || {}), 'marked', 'vite', 'path', 'fs']
};

// markdown 插件类型构建
const markdownDts = {
  input: 'src/plugins/markdown/index.ts',
  output: { file: 'dist/markdown.d.ts', format: 'es' },
  plugins: [alias({ entries: [{ find: '#', replacement: path.resolve(__dirname, './src') }] }), dts()]
};

export default [...base, markdownJs, markdownDts];