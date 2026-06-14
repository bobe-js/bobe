import { bobe, Store } from 'bobe';
import type { Menu } from 'bobe-router';

class MenuItem extends Store {
  item!: Menu;
  depth = 0;

  get itemClass() {
    return 'list-none py-0.5 ' + (
      this.depth === 0
        ? 'text-base font-medium'
        : this.depth === 1
          ? 'text-sm opacity-75'
          : 'text-xs opacity-55'
    );
  }

  ui = bobe`
    li class={itemClass}
      if item.hasComponent
        a 
        | href={item.path} 
        | {item.name} 
        | class="block py-1 px-3 rounded text-var(--md-text) no-underline transition-colors hover:bg-(--md-bg-secondary)"
      else
        span {item.name} class="block py-1 px-3 rounded text-(--md-text) transition-colors hover:bg-(--md-bg-secondary)"
      if item.children?.length
        ul class="list-none p-0 m-0 pl-0 border-l border-(--md-border) ml-[15px]"
          for item.children; child
            ${MenuItem} item={child} depth={depth + 1}
  `;
}

class MenuComp extends Store {
  name!: string;
  menus!: Menu[];

  ui = bobe`
    nav
      h1 class="text-xl font-semibold text-(--md-text) pt-6.5 py-4 px-3" {name}
      ul class="list-none p-0 m-0"
        for menus; item
          ${MenuItem} item={item} depth={0}
  `;
}

export default MenuComp;
