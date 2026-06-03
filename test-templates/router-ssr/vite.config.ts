import { defineConfig } from 'vite';
import markdown from 'bobe-dom/plugin-markdown';
import bobeRouter from 'bobe-router/plugin';

export default defineConfig({
  plugins: [
    markdown({
      marked: {
        gfm: true, // GitHub Flavored Markdown
        renderer: {
          heading({ tokens, depth }) {
            const text = this.parser.parseInline(tokens);
            const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-');
            return `<h${depth} id="${id}">${text}</h${depth}>`;
          }
        }
      }
    }),
    bobeRouter({ dir: 'src/pages', extensions: ['.ts', '.js', '.md'] })
  ]
});
