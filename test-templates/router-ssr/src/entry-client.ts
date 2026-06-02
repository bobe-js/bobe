import 'bobe-router/csr-routes';
import { hydrate } from 'bobe-dom';
import { App } from './app';
import { router } from './router';

router.ready(() => {
  const root = document.getElementById('app')!;
  hydrate(App, root);
});
