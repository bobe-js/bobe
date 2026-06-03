declare module '*.md' {
  import type { UI } from 'bobe';
  const component: UI<any>;
  export default component;
}
