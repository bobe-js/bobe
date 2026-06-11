import 'bobe-router/csr-routes';
import { hydrate } from 'bobe-dom';
import { App } from './app';
import { router } from './router';
import  'bobe-dom/plugin-markdown/index.css';
import './app.scss';

router.ready(() => {
  const root = document.getElementById('app')!;
  hydrate(App, root);
});
