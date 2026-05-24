import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createConfig } from '../../config/rollup.js';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json')))
export default createConfig(pkg, __dirname)