import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfig, createPlugins } from '../../config/rollup.js';
import replace from '@rollup/plugin-replace';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')));

const configs = createConfig(pkg, __dirname);

export default [
  {
    ...configs[0],
    plugins: [
      ...configs[0].plugins,
      replace({
        __IS_COMPILER__: JSON.stringify(false)
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
        file: 'dist/bobe.compiler.cjs.js',
        format: 'cjs',
        sourcemap: true
      }
    ],
    plugins: [
      ...createPlugins(pkg, __dirname),
      replace({
        __IS_COMPILER__: JSON.stringify(true)
      })
    ],
    external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]
  },
  configs[1]
];
