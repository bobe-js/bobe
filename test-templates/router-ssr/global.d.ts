declare module '*.md' {
  import type { UI } from 'bobe';
  const component: UI<any>;
  export default component;
}

// declare module '*.scss' {
//   const content: Record<string, string>;
//   export default content;
// }
