import { render } from 'bobe-dom';
import { App } from './app';
import { router } from './router';

router.ready(() => {
  render(App, document.getElementById('app')!);
});
