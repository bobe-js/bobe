import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfig, createPlugins } from '../../config/rollup.js';
import dts from 'rollup-plugin-dts';
import alias from '@rollup/plugin-alias';
import fs from 'fs';
import path from 'path';
import postcss from 'rollup-plugin-postcss';
import postcssUrl from 'postcss-url'; // 引入这个

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')))

// 基础构建（src/index.ts）
const base = createConfig(pkg, __dirname);

// markdown 插件构建
const markdownJs = {
  input: 'src/plugins/markdown/index.ts',
  output: [
    { file: 'dist/markdown.cjs', format: 'cjs', sourcemap: true },
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

// Code 组件构建
const codeJs = {
  input: 'src/plugins/markdown/components/code.ts',
  output: [
    { file: 'dist/code.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/code.esm.js', format: 'esm', sourcemap: true }
  ],
  plugins: [
    // 1. 把 postcss 插件放在前面，让它先处理 .css 文件
    postcss({
      // extract: true, // 如果你想把 CSS 单独提取到一个 dist/code.css 文件里，取消这行的注释
      extract: 'index.css', // 也可以直接指定输出的文件名
      minimize: true,      // 是否压缩 CSS
      extensions: ['.css'], // 指定处理的文件扩展名
      to: path.resolve(__dirname, 'dist/index.css'), // 告诉 postcss-url 输出 CSS 的位置，用于正确计算 url() 相对路径
      plugins: [
        postcssUrl({
          url: 'copy', // 复制文件
          assetsPath: 'fonts', // 把字体打包到 dist/fonts 目录下 (相对于 to)
          useHash: false
        })
      ],
    }), ...createPlugins(pkg, __dirname),
    // 单独拷贝 code.css 到 dist 目录
    {
      name: 'copy-code-css',
      writeBundle() {
        fs.copyFileSync(
          path.resolve(__dirname, 'src/plugins/markdown/components/code.css'),
          path.resolve(__dirname, 'dist/code.css')
        );
      }
    }
  ],
  external: Object.keys(pkg.dependencies || {})
};


// SSR 构建（仅 render-html-str2）
const ssrJs = {
  input: 'src/ssr-index.ts',
  output: [
    { file: 'dist/ssr-index.cjs', format: 'cjs', sourcemap: true },
    { file: 'dist/ssr-index.esm.js', format: 'esm', sourcemap: true }
  ],
  plugins: createPlugins(pkg, __dirname),
  external: Object.keys(pkg.dependencies || {})
};

export default [...base, markdownJs, markdownDts, codeJs, ssrJs];