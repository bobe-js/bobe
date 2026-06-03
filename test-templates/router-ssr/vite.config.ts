import { defineConfig } from 'vite';
import markdown from 'bobe-dom/plugin-markdown';
import bobeRouter from 'bobe-router/plugin';

export default defineConfig({
  plugins: [
    markdown(),
    bobeRouter({ dir: 'src/pages', extensions: ['.ts', '.js', '.md'] })
  ]
});
