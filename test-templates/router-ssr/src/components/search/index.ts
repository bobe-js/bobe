import { bobe, effect, Store } from 'bobe';
import { router } from '../../router';
import {
  readSearchHistory,
  saveSearchHistoryItem,
  type SearchHistoryItem,
  type SearchHistorySnapshot,
} from './history';
import { compactSearchExcerptHtml } from './excerpt';
import { applySearchHighlight } from './pagefind-highlight';

interface SearchResult extends SearchHistorySnapshot {}

interface SearchOption {
  id: string;
}

interface VisibleResult {
  query: string;
  href: string;
  result: SearchResult;
}

type LoadMoreMode = 'initial' | 'next' | 'fill';

export default class SearchComp extends Store {
  initialResultLimit = 16;
  resultBatchSize = 8;
  query = '';
  results: SearchResult[] = [];
  searchHistory: SearchHistoryItem[] = [];
  rawResults: any[] = [];
  loadedCount = 0;
  hasMore = false;
  loading = false;
  loadingMore = false;
  error = '';
  isOpen = false;
  activeIndex = -1;
  hasSearched = false;
  pagefind: any = null;
  ready = false;
  rootRef: HTMLElement | null = null;
  inputRef: HTMLInputElement | null = null;
  panelRef: HTMLElement | null = null;
  searchTimer: ReturnType<typeof setTimeout> | null = null;
  searchSeq = 0;
  isComposing = false;
  autoFillLimit = 3;

  constructor() {
    super();
    this.loadHistory();

    effect(() => {
      if (typeof document === 'undefined') return;

      const handleMouseDown = (event: MouseEvent) => {
        if (!this.rootRef?.contains(event.target as Node)) {
          this.close();
        }
      };

      document.addEventListener('mousedown', handleMouseDown);
      return () => document.removeEventListener('mousedown', handleMouseDown);
    });
  }

  async initPagefind() {
    if (this.ready) return;
    try {
      // @ts-ignore
      const mod = await import('/pagefind/pagefind.js');
      // 兼容 Pagefind v1.5+ (Pagefind 类) 和旧版 (直接 export 函数)
      this.pagefind = typeof mod.Pagefind === 'function' ? new mod.Pagefind() : mod;
      // 部分版本需显式 init
      if (typeof this.pagefind.init === 'function') {
        await this.pagefind.init();
      }
      // 显式设置 baseUrl，避免 pagefind 自动推导出错误的路径前缀
      if (typeof this.pagefind.options === 'function') {
        await this.pagefind.options({ baseUrl: '/' });
      }
    } catch {
      this.pagefind = null;
    } finally {
      this.ready = true;
    }
  }

  get flatResults(): SearchOption[] {
    const options: SearchOption[] = [];
    const entries = this.visibleResults;
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i].result;
      options.push({ id: this.getOptionId(this.getResultIndex(i)) });
      const subResults = item.sub_results || [];
      for (let j = 0; j < subResults.length; j++) {
        options.push({ id: this.getOptionId(this.getSubResultIndex(i, j)) });
      }
    }
    return options;
  }

  get showEmpty() {
    return Boolean(this.query.trim()) && this.hasSearched && !this.loading && !this.error && !this.results.length;
  }

  get isHistoryMode() {
    return !this.query.trim() && this.searchHistory.length > 0;
  }

  get visibleResults(): VisibleResult[] {
    if (this.isHistoryMode) {
      return this.searchHistory.map(item => ({
        query: item.query,
        href: item.href,
        result: item.result,
      }));
    }

    return this.results.map(item => ({
      query: this.query,
      href: item.url,
      result: item,
    }));
  }

  get showPanel() {
    return this.isOpen && (
      this.isHistoryMode
      || this.loading
      || this.loadingMore
      || Boolean(this.error)
      || this.results.length > 0
      || this.showEmpty
    );
  }

  get showEnd() {
    return !this.isHistoryMode
      && this.results.length > 0
      && !this.hasMore
      && !this.loading
      && !this.loadingMore
      && !this.error;
  }

  get panelId() {
    return 'site-search-results';
  }

  get activeDescendant() {
    return this.activeIndex >= 0 ? this.getOptionId(this.activeIndex) : undefined;
  }

  getOptionId(index: number) {
    return `site-search-option-${index}`;
  }

  getResultIndex(resultIndex: number) {
    let index = 0;
    const results = this.visibleResults;
    const end = Math.min(Math.max(resultIndex, 0), results.length);
    for (let i = 0; i < end; i++) {
      index += 1 + (results[i]?.result.sub_results?.length || 0);
    }
    return index;
  }

  getSubResultIndex(resultIndex: number, subIndex: number) {
    return this.getResultIndex(resultIndex) + subIndex + 1;
  }

  getOptionClass(index: number, extra = '') {
    const active = index === this.activeIndex
      ? ' bg-(--md-bg-secondary) text-(--md-text)'
      : ' text-(--md-text-muted)';
    return `${extra}${active}`;
  }

  open() {
    if (this.query.trim()) {
      this.isOpen = true;
      return;
    }
    this.loadHistory();
    this.isOpen = this.searchHistory.length > 0;
  }

  close() {
    this.isOpen = false;
    this.activeIndex = -1;
  }

  resetSearchState() {
    this.results = [];
    this.rawResults = [];
    this.loadedCount = 0;
    this.hasMore = false;
    this.loading = false;
    this.loadingMore = false;
    this.error = '';
    this.hasSearched = false;
    this.activeIndex = -1;
  }

  async onInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.query = value;
    if (!value.trim()) this.loadHistory();
    this.isOpen = Boolean(value.trim()) || this.searchHistory.length > 0;
    this.activeIndex = -1;

    if (this.isComposing) return;
    this.scheduleSearch(value);
  }

  onFocus() {
    if (!this.query.trim()) {
      this.loadHistory();
      this.isOpen = this.searchHistory.length > 0;
      this.activeIndex = -1;
      return;
    }

    if (this.query.trim() && (this.results.length || this.loading || this.error || this.showEmpty)) {
      this.isOpen = true;
    }
  }

  onCompositionStart() {
    this.isComposing = true;
  }

  onCompositionEnd(e: Event) {
    this.isComposing = false;
    this.onInput(e);
  }

  scheduleSearch(value: string) {
    this.searchSeq++;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }

    if (!value.trim()) {
      this.resetSearchState();
      this.loadHistory();
      this.isOpen = this.searchHistory.length > 0;
      this.activeIndex = -1;
      return;
    }

    this.results = [];
    this.rawResults = [];
    this.loadedCount = 0;
    this.hasMore = false;
    this.loadingMore = false;
    this.loading = true;
    this.error = '';
    this.hasSearched = false;
    this.activeIndex = -1;
    const seq = this.searchSeq;
    this.searchTimer = setTimeout(() => {
      this.runSearch(value, seq);
    }, 180);
  }

  async runSearch(value: string, seq: number) {
    try {
      await this.initPagefind();
      if (seq !== this.searchSeq || value !== this.query) return;

      if (!this.pagefind) {
        this.results = [];
        this.error = '搜索暂不可用';
        this.hasSearched = true;
        return;
      }

      const search = await this.pagefind.search(value);
      if (seq !== this.searchSeq || value !== this.query) return;

      this.rawResults = search?.results || [];
      this.loadedCount = 0;
      this.results = [];
      this.hasMore = this.rawResults.length > 0;
      this.hasSearched = true;
      await this.loadMoreResults(seq, value, 'initial');
      if (seq !== this.searchSeq || value !== this.query) return;
      this.loading = false;
      await this.fillPanelIfNeeded(seq, value);
    } catch {
      this.results = [];
      this.rawResults = [];
      this.loadedCount = 0;
      this.hasMore = false;
      this.loadingMore = false;
      this.error = '搜索暂不可用';
      this.hasSearched = true;
    } finally {
      if (seq === this.searchSeq) {
        this.loading = false;
      }
    }
  }

  async loadMoreResults(seq: number, value: string, mode: LoadMoreMode) {
    if (seq !== this.searchSeq || value !== this.query || !this.hasMore) return false;
    if (this.loadingMore) return false;

    const limit = this.getBatchLimit(mode);
    const start = this.loadedCount;
    const end = Math.min(start + limit, this.rawResults.length);
    if (start >= end) {
      this.hasMore = false;
      return false;
    }

    this.loadingMore = mode !== 'initial';
    const items: SearchResult[] = [];
    try {
      for (const r of this.rawResults.slice(start, end)) {
        const data = await r.data();
        if (seq !== this.searchSeq || value !== this.query) return false;
        items.push(this.toSearchResult(data));
      }

      if (seq !== this.searchSeq || value !== this.query) return false;
      this.results = this.results.concat(items);
      this.loadedCount = end;
      this.hasMore = this.loadedCount < this.rawResults.length;
      return items.length > 0;
    } catch {
      if (seq === this.searchSeq && value === this.query) {
        this.error = '搜索暂不可用';
        this.hasMore = false;
      }
      return false;
    } finally {
      if (seq === this.searchSeq && value === this.query) {
        this.loadingMore = false;
      }
    }
  }

  getBatchLimit(mode: LoadMoreMode) {
    const value = mode === 'initial' ? this.initialResultLimit : this.resultBatchSize;
    return Math.max(1, Math.floor(Number(value) || 1));
  }

  toSearchResult(data: any): SearchResult {
    const headingResults = this.getHeadingResults(data);
    // 只展示标题锚点；Pagefind 可能会把页面本身或第一个标题放在 sub_results[0]。
    const sub_results = headingResults.map((s: any) => ({
      url: s.url,
      title: s.title,
      excerpt: s.excerpt || '',
    }));
    return {
      url: this.getMatchedHeadingUrl(data, headingResults),
      title: data.meta?.title || data.url,
      excerpt: data.excerpt || '',
      sub_results: sub_results.length ? sub_results : undefined,
    };
  }

  getHeadingResults(data: any) {
    return (data.sub_results || [])
      .filter((s: any) => s?.url && this.getUrlHash(s.url));
  }

  getMatchedHeadingUrl(data: any, headingResults: any[]) {
    if (!headingResults.length) return data.url;

    const mainExcerpt = this.normalizeSearchText(data.plain_excerpt || data.excerpt || '');
    if (!mainExcerpt) return headingResults[0].url || data.url;

    let best = headingResults[0];
    let bestScore = -1;
    for (const item of headingResults) {
      const excerpt = this.normalizeSearchText(item.plain_excerpt || item.excerpt || '');
      const score = this.getTextOverlapScore(mainExcerpt, excerpt);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    return best?.url || data.url;
  }

  getUrlHash(url: string) {
    try {
      const base = typeof location === 'undefined' ? 'http://localhost' : location.origin;
      return new URL(url, base).hash;
    } catch {
      return '';
    }
  }

  getTextOverlapScore(a: string, b: string) {
    if (!a || !b) return 0;
    if (a === b) return 10000;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length);

    const bTokens = new Set(this.getSearchTokens(b));
    return this.getSearchTokens(a).reduce((score, token) => (
      bTokens.has(token) ? score + token.length : score
    ), 0);
  }

  getSearchTokens(text: string) {
    return text
      .split(/[\s,.;:!?()[\]{}'"`<>/\\|，。！？；：、（）【】《》]+/)
      .map(token => token.trim())
      .filter(token => token.length > 1);
  }

  normalizeSearchText(value: string) {
    return String(value)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  async fillPanelIfNeeded(seq: number, value: string) {
    if (typeof window === 'undefined') return;

    for (let i = 0; i < this.autoFillLimit; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (seq !== this.searchSeq || value !== this.query || !this.hasMore) return;
      const panel = this.panelRef;
      if (!panel || panel.scrollHeight > panel.clientHeight) return;
      const loaded = await this.loadMoreResults(seq, value, 'fill');
      if (!loaded) return;
    }
  }

  handlePanelScroll() {
    const panel = this.panelRef;
    if (this.isHistoryMode || !panel || !this.hasMore || this.loading || this.loadingMore) return;
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 48) {
      this.loadMoreResults(this.searchSeq, this.query, 'next');
    }
  }

  moveActive(step: number) {
    const count = this.flatResults.length;
    if (!count) return;
    this.isOpen = true;
    this.activeIndex = this.activeIndex < 0
      ? (step > 0 ? 0 : count - 1)
      : (this.activeIndex + step + count) % count;
  }

  openActive() {
    const item = this.flatResults[this.activeIndex];
    if (item) {
      document.getElementById(item.id)?.click();
    }
  }

  handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveActive(-1);
    } else if (e.key === 'Enter' && this.activeIndex >= 0) {
      e.preventDefault();
      this.openActive();
    } else if (e.key === 'Escape') {
      this.close();
      this.inputRef?.blur();
    }
  }

  loadHistory() {
    this.searchHistory = readSearchHistory();
  }

  createHistorySnapshot(item: SearchHistorySnapshot): SearchHistorySnapshot {
    return {
      url: item.url,
      title: item.title,
      excerpt: item.excerpt || '',
    };
  }

  getCompactExcerptHtml(excerpt: string) {
    return compactSearchExcerptHtml(excerpt, {
      lead: 28,
      maxLength: 160,
    });
  }

  async handleResultClick(e: MouseEvent, href: string, query = this.query, item?: SearchHistorySnapshot) {
    e.preventDefault();
    e.stopPropagation();
    const searchQuery = query.trim();
    const historySnapshot = item ? this.createHistorySnapshot(item) : undefined;
    this.closeAfterSelect();

    const navigation = await router.pushState(href);
    if (navigation.status === 'completed') {
      if (searchQuery && historySnapshot) {
        this.searchHistory = saveSearchHistoryItem(searchQuery, href, historySnapshot);
      }
      await applySearchHighlight(searchQuery);
    }
  }

  closeAfterSelect() {
    this.searchSeq++;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.resetSearchState();
    this.query = '';
    this.isOpen = false;
    this.inputRef?.blur();
  }

  ui = bobe`
    div ref={rootRef} data-search-root="true" class="relative"
      input
      | ref={inputRef}
      | type="text"
      | role="combobox"
      | aria-expanded={showPanel}
      | aria-controls={panelId}
      | aria-activedescendant={activeDescendant}
      | autocomplete="off"
      | placeholder="搜索..."
      | value={query}
      | oninput={(e) => onInput(e)}
      | onfocus={() => onFocus()}
      | onkeydown={(e) => handleKeydown(e)}
      | oncompositionstart={() => onCompositionStart()}
      | oncompositionend={(e) => onCompositionEnd(e)}
      | class="pointer-events-auto w-full px-3 py-1.5 bg-(--md-bg-secondary) border border-(--md-border) rounded-md outline-none text-sm text-(--md-text) placeholder:text-(--md-text-muted) focus:border-(--md-accent-focus)"

      if showPanel
        div
        | ref={panelRef}
        | id={panelId}
        | role="listbox"
        | onscroll={() => handlePanelScroll()}
        | class="[&_mark]:py-0.5 [&_mark]:px-1 [&_mark]:bg-(--md-accent-focus) [&_mark]:rounded-sm absolute top-full left-0 right-0 mt-1 bg-(--md-bg) border border-(--md-border) rounded-md shadow-lg z-50 max-h-150 overflow-y-auto"
          if isHistoryMode
            div class="px-3 py-2 text-sm text-(--md-text-muted) border-b border-(--md-border)"
              span "最近访问"
          else loading
            div class="px-3 py-2 text-base text-(--md-text-muted)" "搜索中..."
          if error
            div class="px-3 py-2 text-base text-(--md-text-muted)" {error}
          for visibleResults; entry i
            div class="text-base border-b border-(--md-border) last:border-b-0"
              a
              | id={getOptionId(getResultIndex(i))}
              | role="option"
              | aria-selected={activeIndex === getResultIndex(i)}
              | href={entry.href}
              | onclick={(e) => handleResultClick(e, entry.href, entry.query, entry.result)}
              | onmouseenter={() => activeIndex = getResultIndex(i)}
              | class={getOptionClass(getResultIndex(i), 'block px-3 py-2.5 rounded no-underline transition-colors hover:bg-(--md-bg-secondary)')}
                span class="font-medium text-[16px] text-(--md-text) block truncate" {entry.result.title}
                span class="text-sm text-(--md-text-muted) mt-1 line-clamp-2" html={getCompactExcerptHtml(entry.result.excerpt)}
              if entry.result.sub_results?.length
                div class="pt-1"
                  for entry.result.sub_results; sub j
                    a
                    | id={getOptionId(getSubResultIndex(i, j))}
                    | role="option"
                    | aria-selected={activeIndex === getSubResultIndex(i, j)}
                    | href={sub.url}
                    | onclick={(e) => handleResultClick(e, sub.url, entry.query, sub)}
                    | onmouseenter={() => activeIndex = getSubResultIndex(i, j)}
                    | class={getOptionClass(getSubResultIndex(i, j), 'block px-3 py-2.5 rounded no-underline transition-colors hover:bg-(--md-bg-secondary)')}
                      div class="flex min-w-0 items-center gap-1.5"
                        span class="shrink-0 rounded-sm border border-(--md-border) px-1.5 py-0.5 text-xs font-medium leading-none text-(--md-text-muted)" "标题"
                        span class="min-w-0 truncate text-[14px] font-medium text-(--md-text)" {sub.title}
                      div class="mt-0.5 truncate text-sm text-(--md-text-muted)" html={getCompactExcerptHtml(sub.excerpt)}
          if loadingMore
            div class="px-3 py-2 text-sm text-center text-(--md-text-muted)" "加载更多..."
          if showEnd
            div class="px-3 py-2 text-sm text-center text-(--md-text-muted)" "已加载全部结果"
          if showEmpty
            div class="px-3 py-2 text-sm text-(--md-text-muted)"
              span "No results for '"
              span class="font-medium text-(--md-text)" {query}
              span "'"
  `;
}
