import { render } from 'bobe-dom';
import { App } from './app';
import { router } from './router';

router.ready(() => {
  const [_, app] = render(App, document.getElementById('app')!);
  (window as any).app = app;
});
