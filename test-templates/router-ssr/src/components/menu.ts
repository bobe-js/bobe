import { bobe, Store } from 'bobe';
import type { Menu } from 'bobe-router';
import styles from './menu.module.scss';

class MenuItem extends Store {
  item!: Menu;
  styles = styles;

  ui = bobe`
    li class={styles.item}
      if item.hasComponent
        a href={item.path} text={item.name}
      else
        span text={item.name}
      if item.children && item.children.length > 0
        ul class={styles.list}
          for item.children; child
            ${MenuItem} item={child}
  `;
}

class MenuComp extends Store {
  name!: string;
  menus!: Menu[];
  styles = styles;

  ui = bobe`
    nav class={styles.nav}
      h3 class={styles.title} text={name}
      ul class={styles.list}
        for menus; item
          ${MenuItem} item={item}
  `;
}

export default MenuComp;
