import { BOBE_EVENT, DELEGATED } from './global';

/*----------------- 类似事件合成的性能优化，优化内存 -----------------*/
export function delegateEventOnRoot(root: HTMLElement, name: string) {
  const delegatedEvents = root[DELEGATED] || (root[DELEGATED] = {});

  if (!delegatedEvents[name]) {
    delegatedEvents[name] = true;
    root.addEventListener(name, e => mockBubble(e, root));
  }
}

function mockBubble(e: Event, root: any) {
  let node: any = (e.composedPath && e.composedPath()[0]) || e.target;
  if (e.target !== node) {
    Object.defineProperty(e, 'target', {
      configurable: true,
      value: node
    });
  }
  Object.defineProperty(e, 'currentTarget', {
    configurable: true,
    get() {
      return node || root;
    }
  });
  while (node !== null) {
    const handler = node[`${BOBE_EVENT}${e.type}`];
    if (handler) {
      handler(e);
      if (e.cancelBubble) return;
    }
    node = node.host && node.host !== node && node.host instanceof Node ? node.host : node.parentNode;
  }
}
