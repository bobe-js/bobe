import { hydrate } from 'bobe-dom';
import { App } from './app';
import { router } from './router';
import { installPagefindHighlight } from './components/search/pagefind-highlight';
import  'bobe-dom/plugin-markdown/index.css';
import './app.css';

router.ready(() => {
  const root = document.getElementById('app')!;
  hydrate(App, root);
  installPagefindHighlight();
});
