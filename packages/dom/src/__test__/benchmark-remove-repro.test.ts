/**
 * @vitest-environment jsdom
 */
import { bobe, Store } from 'bobe';
import { render } from '#/render';

const tick = () => new Promise(r => queueMicrotask(() => r(1)));
const buildRows = (count = 1000) => Array.from({ length: count }, (_, i) => ({ id: i + 1, label: String(i + 1) }));

describe('benchmark remove-one reproduction', () => {
  it('keeps row text aligned after deleting one keyed row', async () => {
    class App extends Store {
      rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, label: String(i + 1) }));

      remove(id: number) {
        const rows = this.rows;
        rows.splice(
          rows.findIndex(row => row.id === id),
          1
        );
        this.rows = rows.slice();
      }

      ui = bobe`
        table
          tbody
            for rows; row; row.id
              tr
                td {row.id}
                td
                  a onclick={() => remove(row.id)} children="remove"
      `;
    }

    const root = document.createElement('div');
    render(App, root);

    (root.querySelector('tbody tr:nth-of-type(9) a') as HTMLElement).click();
    await tick();

    expect(root.querySelector('tbody tr:nth-of-type(9) td')!.textContent).toBe('10');
  });

  it('does not delegate the same click through both root and inserted for parent', async () => {
    class App extends Store {
      rows = [];

      setRows(update: any[]) {
        this.rows = update;
      }

      refresh1000 = () => {
        this.setRows(buildRows());
      };

      remove(id: number) {
        const rows = this.rows;
        rows.splice(
          rows.findIndex(row => row.id === id),
          1
        );
        this.setRows(rows.slice());
      }

      ui = bobe`
        button id='run' onclick={refresh1000} children="run"
        table
          tbody
            for rows; row; row.id
              tr
                td {row.id}
                td
                  a onclick={() => remove(row.id)} children="remove"
      `;
    }

    const root = document.createElement('div');
    render(App, root);

    (root.querySelector('#run') as HTMLElement).click();
    await tick();

    (root.querySelector('tbody tr:nth-of-type(9) a') as HTMLElement).click();
    await tick();

    expect(root.querySelectorAll('tbody tr')).toHaveLength(999);
    expect(root.querySelector('tbody tr:nth-of-type(9) td')!.textContent).toBe('10');
  });
});
