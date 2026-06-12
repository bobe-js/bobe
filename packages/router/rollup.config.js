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

// plugin 代码构建
const pluginJs = {
  input: 'src/plugin/index.ts',
  output: [
    { file: 'dist/plugin.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/plugin.esm.js', format: 'esm', sourcemap: true }
  ],
  plugins: [
    ...createPlugins(pkg, __dirname),
    {
      writeBundle() {
        fs.copyFileSync(
          path.resolve(__dirname, 'src/ssr-routes.d.ts'),
          path.resolve(__dirname, 'dist/ssr-routes.d.ts')
        );
      }
    }
  ],
  external: [...Object.keys(pkg.dependencies || {}), 'vite', 'path', 'fs']
};

// plugin 类型构建
const pluginDts = {
  input: 'src/plugin/index.ts',
  output: { file: 'dist/plugin.d.ts', format: 'es' },
  plugins: [alias({ entries: [{ find: '#', replacement: path.resolve(__dirname, './src') }] }), dts()]
};

export default [...base, pluginJs, pluginDts];
