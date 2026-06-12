import { bobe, Store } from 'bobe';
import styles from './drop-down.module.scss';

export interface DropDownItem {
  text: string;
  value?: any;
  disabled?: boolean;
}

export class DropDown extends Store {
  items: DropDownItem[] = [];
  label = '请选择';
  auto = false;
  bordered = true;
  onSelect: ((item: DropDownItem) => void) | null = null;

  isOpen = false;
  styles = styles;

  toggle() {
    this.isOpen = !this.isOpen;
  }

  close() {
    this.isOpen = false;
  }

  selectItem(item: DropDownItem) {
    if (item.disabled) return;
    this.label = item.text;
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

  ui = bobe`
    div
    | class={styles['drop-down']}
    | onmouseenter={() => handleMouseEnter()}
    | onmouseleave={() => handleMouseLeave()}
      button
      | class={bordered ? styles.trigger : (styles.trigger + ' ' + styles.borderless + (isOpen ? ' ' + styles.dimmed : ''))}
      | onclick={() => toggle()}
      | onkeydown={(e) => handleTriggerKeydown(e)}
      | {label}
      ul class={isOpen ? styles.menu + ' ' + styles.open : styles.menu}
        for items; item
          li
          | class={item.disabled ? styles.item + ' ' + styles.disabled : styles.item}
          | onclick={() => selectItem(item)}
          | {item.text}
  `;
}
