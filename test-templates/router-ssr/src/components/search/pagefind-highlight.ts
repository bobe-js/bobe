import { router } from '../../router';

const HIGHLIGHT_CLASS = 'pagefind-highlight';
const SKIP_SELECTOR = [
  'script',
  'style',
  'textarea',
  'input',
  'select',
  'option',
  `[data-pagefind-ignore]`,
  `[data-pagefind-ignore] *`,
  `.${HIGHLIGHT_CLASS}`,
].join(',');

let installed = false;
let hasActiveHighlight = false;

export async function applySearchHighlight(query: string) {
  if (typeof window === 'undefined') return;
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return;

  await nextFrame();
  const root = getHighlightRoot();
  clearHighlights(root);
  hasActiveHighlight = applyHighlights(normalizedQuery, root);
}

export function installPagefindHighlight() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  document.addEventListener('click', handleDocumentClick, true);
}

function handleDocumentClick(event: MouseEvent) {
  if (!hasActiveHighlight) return;
  clearHighlights(getHighlightRoot());
}

function applyHighlights(query: string, root: HTMLElement) {
  const terms = getHighlightTerms(query);
  if (!terms.length) return false;

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      pattern.lastIndex = 0;
      return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    wrapTextMatches(textNode, pattern);
  }

  return textNodes.length > 0;
}

function wrapTextMatches(textNode: Text, pattern: RegExp) {
  const value = textNode.nodeValue || '';
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  pattern.lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const text = match[0];
    if (!text) continue;

    if (index > lastIndex) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)));
    }

    const mark = document.createElement('mark');
    mark.className = HIGHLIGHT_CLASS;
    mark.textContent = text;
    fragment.appendChild(mark);
    lastIndex = index + text.length;
  }

  if (lastIndex < value.length) {
    fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
  }

  textNode.parentNode?.replaceChild(fragment, textNode);
}

function clearHighlights(root: HTMLElement) {
  hasActiveHighlight = false;
  const highlights = root.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  for (const highlight of highlights) {
    const parent = highlight.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
    parent.normalize();
  }
}

function getHighlightTerms(query: string) {
  const normalizedQuery = query.trim();
  return Array.from(new Set([
    normalizedQuery,
    ...normalizedQuery
      .split(/[\s,.;:!?()[\]{}'"`<>/\\|，。！？；：、（）【】《》]+/)
      .map(term => term.trim())
      .filter(Boolean),
  ])).sort((a, b) => b.length - a.length);
}

function getHighlightRoot() {
  return document.getElementById(router.scrollRootId || '') || document.body;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
