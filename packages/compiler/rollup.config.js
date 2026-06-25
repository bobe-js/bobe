import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfig, createPlugins } from '../../config/rollup.js';
import replace from '@rollup/plugin-replace';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')));

const configs = createConfig(pkg, __dirname);
const __DEV__ = process.env.NODE_ENV === 'dev';

export default [
  {
    ...configs[0],
    plugins: [
      ...configs[0].plugins,
      replace({
        __IS_COMPILER__: JSON.stringify(false),
        __DEV__: JSON.stringify(__DEV__),
        preventAssignment: true
      })
    ]
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/bobe.compiler.esm.js',
        format: 'esm',
        sourcemap: true
      },
      {
        file: 'dist/bobe.compiler.cjs',
        format: 'cjs',
        sourcemap: true
      }
    ],
    plugins: [
      ...createPlugins(pkg, __dirname),
      replace({
        __IS_COMPILER__: JSON.stringify(true),
        __DEV__: JSON.stringify(__DEV__),
        preventAssignment: true,
      })
    ],
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]
  },
  configs[1]
];
