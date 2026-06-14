import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import markdown from 'bobe-dom/plugin-markdown';
import bobeRouter from 'bobe-router/plugin';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    markdown(),
    bobeRouter({ dir: 'src/pages', extensions: ['.ts', '.js', '.md'] }),
    {
      name: 'pagefind-dev',
      apply: 'serve',
      resolveId(id) {
        if (id === '/pagefind/pagefind.js') {
          return path.resolve(__dirname, 'dist/client/pagefind/pagefind.js');
        }
      }
    }
  ],
  build: {
    rollupOptions: {
      external: ['/pagefind/pagefind.js']
    }
  }
});
