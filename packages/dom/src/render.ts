import { customRender, Interpreter } from 'bobe';
import { CONTENT_FLAG, MATH_NS, MATH_TAGS, SVG_NS, SVG_TAGS } from './global';
import { setProp } from './set-prop-csr';

// ---- exported for unit testing ----

export function createNode(this: Interpreter, name: string): Node {
  const doc = this.root?.ownerDocument || document;
  if (name === 'text') return doc.createTextNode('');
  if (MATH_TAGS.has(name)) return doc.createElementNS(MATH_NS, name);
  if (SVG_TAGS.has(name)) return doc.createElementNS(SVG_NS, name);
  return doc.createElement(name);
}

export function insertAfter(parent: Node, node: Node, prev: Node | null) {
  if (!prev) parent.insertBefore(node, parent.firstChild);
  else parent.insertBefore(node, prev.nextSibling);
}

export function createAnchor(this: Interpreter, name: string) {
  const doc = this.root?.ownerDocument || document;
  return doc.createComment(name);
}

export function remove(node: Node) {
  (node as Element).remove();
}

export function firstChild(node: Node) {
  return node.firstChild;
}

export function nextSib(node: Node) {
  return node.nextSibling;
}

export function beforeIndent(node: Node): boolean | void {
  if ((node as any)[CONTENT_FLAG]) {
    const tag = (node as Element).tagName?.toLowerCase();
    const hasText = (node as HTMLElement).textContent != null;
    console.warn(`<${tag}> has ${hasText ? 'text' : 'html'} content and child elements — children ignored`);
    return false;
  }
}

export const render = customRender({
  createNode,
  setProp,
  insertAfter,
  createAnchor,
  remove,
  firstChild,
  nextSib,
  beforeIndent
});
