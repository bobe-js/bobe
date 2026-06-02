import { bobe, Store } from 'bobe';
import type { Menu } from 'bobe-router';

class MenuItem extends Store {
  item!: Menu;
  ui = bobe`
    li
      if item.hasComponent
        a href={item.path} text={item.name}
      else
        span text={item.name}
      if item.children && item.children.length > 0
        ul
          for item.children; child
            ${MenuItem} item={child}
  `;
}

class MenuComp extends Store {
  name!: string;
  menus!: Menu[];
  ui = bobe`
    nav
      h3 text={name}
      ul
        for menus; item
          ${MenuItem} item={item}
  `;
}

export default MenuComp;