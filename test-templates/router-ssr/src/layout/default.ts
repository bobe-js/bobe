import { bobe, Store } from 'bobe';
import type { Menu } from 'bobe-router';
import { DropDown } from '../components/drop-down';
import MenuComp from '../components/menu';
import SearchComp from '../components/search';
import { router } from '../router';

export default class Layout extends Store {
  menus: Menu[] = [];
  activePath = '/';
  children: any = null;
  router = (globalThis as any).__SSR_ROUTER__ || router;
  isDarkTheme = true;

  constructor() {
    super();
    this.initTheme();
  }

  initTheme() {
    if (typeof document === 'undefined') return;
    const savedTheme = localStorage.getItem('bobe-theme');
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    this.isDarkTheme = savedTheme ? savedTheme !== 'light' : !prefersLight;
    this.applyTheme();
  }

  applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = this.isDarkTheme ? 'dark' : 'light';
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bobe-theme', this.isDarkTheme ? 'dark' : 'light');
    }
    this.applyTheme();
  }

  findDeep(menu: Menu, activePath: string): Menu | undefined {
    if(menu.path === '/') {
      return;
    }
    // 有 hasSecondNav 说明菜单是顶部一级导航栏，不能被设置到侧边栏
    if (!menu.meta?.hasSecondNav && activePath?.startsWith(menu.path!)) {
      return menu;
    }
    if (menu.children?.length) {
      for (const child of menu.children) {
        const r = this.findDeep(child, activePath);
        if (r) return r;
      }
    }
  }

  get sideBarRoot(): Menu | undefined {
    for (const menu of this.menus || []) {
      const r = this.findDeep(menu, this.activePath);
      if(r) {
        return r;
      }
    }
    return undefined;
  }

  get sidebarTitle() {
    return this.sideBarRoot?.name;
  }

  get sidebarMenus(): Menu[] {
    return this.sideBarRoot?.children || [];
  }

  isActiveNav(path: string | undefined) {
    return !!(path && this.activePath.startsWith(path));
  }

  toDropDownItems(children: Menu[]) {
    return children.map(c => ({ text: c.name, value: c.path || '' }));
  }

  /** 导航到菜单：自身 path 优先，否则用 nearestFile 路径 */
  getMenuPath(menu: Menu): string | undefined {
    return menu.nearestFile?.path || menu.path;
  }

  navigateMenu(menu: Menu) {
    const path = this.getMenuPath(menu);
    if (!path) return;
    router.pushState(path);
  }

  ui = bobe`
    div class="h-screen flex flex-col"
      // ======== 顶部导航栏 ========
      header class="grid grid-cols-[1fr_minmax(0,520px)_1fr] items-center px-6 border-b border-(--md-border)"
        // 左侧 Logo + 导航菜单
        div class="*:shrink-0 justify-self-start w-fit whitespace-nowrap flex items-center gap-4"
          img alt="B" class="h-8 w-7" 
          |src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI4IDMyIj48dGV4dCB4PSIwIiB5PSIyNiIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiM1MzliZjUiPkI8L3RleHQ+PC9zdmc+"
          span class="text-lg font-semibold text-(--md-text)" "Bobe SSR"
          nav class="whitespace-nowrap flex items-center gap-1"
            for menus; menu
              if menu.meta?.hasSecondNav
                ${DropDown}
                | content={menu.name}
                | auto=true
                | bordered=false
                | items={menu.children || []}
                | label="name"
                | value="path"
                | onSelect={(item) => navigateMenu(item)}
              else
                a {menu.name}
                | href={getMenuPath(menu) || '#'}
                | onclick={(e) => { e.preventDefault(); navigateMenu(menu); }}
                | class="px-3 py-1.5 rounded-md text-sm text-(--md-text-muted) no-underline transition-colors hover:bg-(--md-bg-secondary) hover:text-(--md-text)"

        // 中间搜索框
        div class="w-full max-w-[520px] justify-self-center p-[16px]"
          ${SearchComp}

        // 右侧工具图标
        div class="justify-self-end whitespace-nowrap flex *:shrink-0 items-center gap-1.5"
          button
          | type="button"
          | aria-label={isDarkTheme ? '切换亮色主题' : '切换暗色主题'}
          | title={isDarkTheme ? '切换亮色主题' : '切换暗色主题'}
          | onclick={() => toggleTheme()}
          | class="cursor-pointer inline-flex size-9 items-center justify-center rounded-[50%] border-0 bg-transparent p-0 text-(--site-nav-icon) transition-colors hover:bg-(--site-nav-icon-hover-bg) hover:text-(--site-nav-icon-hover)"
            if isDarkTheme
              iconify-icon icon="mdi:white-balance-sunny" aria-hidden="true" class="text-2xl"
            else
              iconify-icon icon="mdi:moon-waning-crescent" aria-hidden="true" class="text-2xl"
          a
          | href="https://github.com/bobe-js/bobe"
          | target="_blank"
          | rel="noreferrer"
          | aria-label="GitHub"
          | title="GitHub"
          | class="inline-flex size-9 items-center justify-center rounded-[50%] text-(--site-nav-icon) no-underline transition-colors hover:bg-(--site-nav-icon-hover-bg) hover:text-(--site-nav-icon-hover)"
            iconify-icon icon="mdi:github" aria-hidden="true" class="text-2xl"

      // ======== 主体（侧边栏 + 内容） ========
      div class="flex flex-1 overflow-hidden"
        // 左侧边栏
        if sidebarMenus.length
          aside class="w-56 shrink-0 border-r border-(--md-border) overflow-y-auto bg-(--md-bg-secondary)"
            ${MenuComp} name={sidebarTitle} menus={sidebarMenus}

        // 右侧内容区
        main id={router.scrollRootId} class="flex-1 overflow-y-auto p-6 text-(--md-text)"
          {children}
  `;
}
