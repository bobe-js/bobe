import { defineConfig } from 'vite';
import bobeRouter from 'bobe-router/plugin';

export default defineConfig({
  plugins: [bobeRouter({ dir: 'src/pages' })]
});
