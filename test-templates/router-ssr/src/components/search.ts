import { bobe, Store } from 'bobe';
import { router } from '../router';

interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
  sub_results?: { url: string; title: string; excerpt: string }[];
}

export default class SearchComp extends Store {
  query = '';
  results: SearchResult[] = [];
  loading = false;
  pagefind: any = null;
  ready = false;

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

  async onInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.query = value;

    await this.initPagefind();

    if (!value.trim() || !this.pagefind) {
      this.results = [];
      return;
    }

    this.loading = true;
    try {
      const search = await this.pagefind.search(value);
      const items: SearchResult[] = [];
      for (const r of (search?.results || []).slice(0, 8)) {
        const data = await r.data();
        // sub_results[0] 是页面本身，跳过；取前 3 个标题锚点
        const sub_results = (data.sub_results || []).slice(1, 4).map((s: any) => ({
          url: s.url,
          title: s.title,
          excerpt: s.excerpt || '',
        }));
        items.push({
          url: data.url,
          title: data.meta?.title || data.url,
          excerpt: data.excerpt || '',
          sub_results: sub_results.length ? sub_results : undefined,
        });
      }
      this.results = items;
    } catch {
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  navigate(url: string) {
    this.results = [];
    this.query = '';
    router.pushState(url);
  }

  ui = bobe`
    div class="relative"
      input
      | type="text"
      | placeholder="Search..."
      | value={query}
      | oninput={(e) => onInput(e)}
      | class="pointer-events-auto w-full px-3 py-1.5 bg-(--md-bg-secondary) border border-(--md-border) rounded-md outline-none text-sm text-(--md-text) placeholder:text-(--md-text-muted) focus:border-(--md-accent-focus)"

      if results.length
        div class="absolute top-full left-0 right-0 mt-1 bg-(--md-bg) border border-(--md-border) rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
          for results; item
            div class="px-3 py-2 text-sm border-b border-(--md-border) last:border-b-0"
              div
              | onclick={() => navigate(item.url)}
              | class="cursor-pointer hover:bg-(--md-bg-secondary) -mx-3 px-3 py-1 rounded"
                span class="font-medium text-(--md-text) block truncate" {item.title}
                span class="text-xs text-(--md-text-muted) mt-0.5 line-clamp-2" html={item.excerpt}
              if item.sub_results?.length
                div class="mt-1.5 mb-1 flex flex-wrap gap-1"
                  for item.sub_results; sub
                    span
                    | onclick={(e) => { e.stopPropagation(); navigate(sub.url); }}
                    | class="inline-block px-2 py-0.5 text-xs rounded bg-(--md-bg-secondary) text-(--md-text-muted) hover:text-(--md-text) hover:bg-(--md-bg-code) cursor-pointer transition-colors"
                    | {sub.title}
      if !results.length && query && !loading
        div class="absolute top-full left-0 right-0 mt-1 bg-(--md-bg) border border-(--md-border) rounded-md shadow-lg z-50 p-3 text-sm text-(--md-text-muted)"
          span "No results for '"
          span class="font-medium text-(--md-text)" {query}
          span "'"
  `;
}
