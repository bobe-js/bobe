import { bobe, Store } from 'bobe';
import styles from './drop-down.module.scss';

export class DropDown<T extends Record<string, any>> extends Store {
  readonly items: T[] = [];
  readonly auto: boolean = false;
  readonly bordered: boolean = true;
  readonly onSelect: ((item: T) => void) | null = null;
  readonly content: string = '请选择';
  readonly label: string = 'label';
  readonly value: string = 'value';

  isOpen = false;
  styles = styles;

  toggle() {
    this.isOpen = !this.isOpen;
  }

  close() {
    this.isOpen = false;
  }

  selectItem(item: T) {
    this.isOpen = false;
    this.onSelect?.(item);
  }

  handleMouseEnter() {
    if (this.auto) this.isOpen = true;
  }

  handleMouseLeave() {
    if (this.auto) this.isOpen = false;
  }

  handleTriggerKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.isOpen = true;
    } else if (e.key === 'Escape') {
      this.isOpen = false;
    }
  }

  get btnClass() {
    return (
      'text-sm ' +
      (this.bordered
        ? styles.trigger
        : `${styles.trigger} ${styles.borderless}${this.isOpen ? ` ${styles.dimmed}` : ''}`)
    );
  }

  ui = bobe`
    div
    | class={styles['drop-down']}
    | onmouseenter={() => handleMouseEnter()}
    | onmouseleave={() => handleMouseLeave()}
      button
      | class={btnClass}
      | onclick={() => toggle()}
      | onkeydown={(e) => handleTriggerKeydown(e)}
      | {content}
      ul class={isOpen ? styles.menu + ' ' + styles.open : styles.menu}
        for items; item ; item[value]
          li
          | class={'text-sm ' + styles.item}
          | onclick={() => selectItem(item)}
          | {item[label]}
  `;
}
