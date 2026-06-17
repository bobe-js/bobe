export interface SearchHistorySnapshot {
  url: string;
  title: string;
  excerpt: string;
  sub_results?: { url: string; title: string; excerpt: string }[];
}

export interface SearchHistoryItem {
  query: string;
  href: string;
  result: SearchHistorySnapshot;
  visitedAt: number;
}

const SEARCH_HISTORY_KEY = 'bobe:router-ssr:search-history';
const SEARCH_HISTORY_LIMIT = 20;

export function readSearchHistory(): SearchHistoryItem[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(toHistoryItem)
      .filter((item): item is SearchHistoryItem => Boolean(item))
      .slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveSearchHistoryItem(query: string, href: string, result: SearchHistorySnapshot) {
  const normalizedQuery = query.trim();
  if (typeof localStorage === 'undefined' || !normalizedQuery || !href || !result.url) return readSearchHistory();

  const item: SearchHistoryItem = {
    query: normalizedQuery,
    href,
    result: cloneResult(result),
    visitedAt: Date.now(),
  };
  const next = [
    item,
    ...readSearchHistory().filter(history => history.href !== item.href),
  ].slice(0, SEARCH_HISTORY_LIMIT);

  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures; search navigation should never depend on history persistence.
  }

  return next;
}

function toHistoryItem(value: unknown): SearchHistoryItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<SearchHistoryItem>;
  if (typeof item.query !== 'string' || !item.query.trim()) return null;
  if (typeof item.visitedAt !== 'number') return null;
  const result = toResultSnapshot(item.result);
  if (!result) return null;

  return {
    query: item.query.trim(),
    href: typeof item.href === 'string' && item.href ? item.href : result.url,
    result,
    visitedAt: item.visitedAt,
  };
}

function toResultSnapshot(value: unknown): SearchHistorySnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<SearchHistorySnapshot>;
  if (typeof result.url !== 'string' || !result.url) return null;
  if (typeof result.title !== 'string') return null;

  return {
    url: result.url,
    title: result.title,
    excerpt: typeof result.excerpt === 'string' ? result.excerpt : '',
  };
}

function cloneResult(result: SearchHistorySnapshot): SearchHistorySnapshot {
  return {
    url: result.url,
    title: result.title,
    excerpt: result.excerpt || '',
  };
}
