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
      header class="grid grid-cols-[1fr_minmax(130px,400px)_1fr] px-6 border-b border-(--md-border)"
        // 左侧 Logo
        div class="justify-self-start whitespace-nowrap shrink-0 flex items-center gap-2"
          img alt="B" class="h-8 w-7" 
          |src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyOCIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI4IDMyIj48dGV4dCB4PSIwIiB5PSIyNiIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiM1MzliZjUiPkI8L3RleHQ+PC9zdmc+"
          span class="text-lg font-semibold text-(--md-text)" "Bobe SSR"

        // 中间搜索框
        div class="w-full max-w-[400px] justify-self-center p-[16px]"
          ${SearchComp}

	        // 占位 spacer，将右侧导航推到右端
	        div class="flex-1"

        // 右侧导航：meta.hasSecondNav 表示有二级菜单用 DropDown 展示
        nav class="justify-self-end shrink-0 whitespace-nowrap flex items-center gap-1"
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
              div {menu.name}
              | href={getMenuPath(menu) || '#'}
              | onclick={() => navigateMenu(menu)}
              | class="px-3 py-1.5 rounded-md text-sm text-(--md-text-muted) no-underline transition-colors hover:bg-(--md-bg-secondary) hover:text-(--md-text)"

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
