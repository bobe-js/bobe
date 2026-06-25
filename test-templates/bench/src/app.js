import { Store, bobe } from "bobe";
import { Keys, deepSignal } from "aoye";
import { buildData } from "./data";
export default class App extends Store {
  selectedId = undefined;
  rows = [];

  setRows(update) {
    update[Keys.ProxyFreeObject] = true;
    this.rows = update;
  }

  addRows1000 = () => {
    const newRows = this.rows.concat(buildData(1000));
    this.setRows(newRows);
  };

  remove(id) {
    const rows = this.rows;
    rows.splice(
      rows.findIndex((d) => d.id === id),
      1
    );
    this.setRows(rows.slice());
  }

  select(id) {
    this.selectedId = id;
  }

  refresh1000 = () => {
    this.setRows(buildData());
    this.selectedId = undefined;
  };

  update = () => {
    const rows = this.rows;
    for (let i = 0; i < rows.length; i += 10) {
      const reactiveRow = deepSignal(rows[i]);
      reactiveRow.label += " !!!";
    }
  };

  refresh1w = () => {
    this.setRows(buildData(10000));
    this.selectedId = undefined;
  };

  clear = () => {
    this.setRows([]);
    this.selectedId = undefined;
  };

  swapRows = () => {
    const rows = this.rows;
    if (rows.length > 998) {
      const d1 = rows[1];
      const d998 = rows[998];
      rows[1] = d998;
      rows[998] = d1;
    }
    this.setRows(rows.slice());
  };

  ui = bobe`
    div class='jumbotron'
      div class='row'
        div class='col-md-6'
          h1 'Bobe (keyed)'
        div class='col-md-6'
          div class='row'
            div class='col-sm-6 smallpad'
              button 'Create 1,000 rows'
              | id='run'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={refresh1000}
            div class='col-sm-6 smallpad'
              button 'Create 10,000 rows'
              | id='runlots'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={refresh1w}
            div class='col-sm-6 smallpad'
              button 'Append 1,000 rows'
              | id='add'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={addRows1000}
            div class='col-sm-6 smallpad'
              button 'Update every 10th row'
              | id='update'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={update}
            div class='col-sm-6 smallpad'
              button 'Clear'
              | id='clear'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={clear}
            div class='col-sm-6 smallpad'
              button 'Swap Rows'
              | id='swaprows'
              | type='button'
              | class='btn btn-primary btn-block'
              | onclick={swapRows}
    table class='table table-hover table-striped test-data'
      tbody
        for rows; row; row.id
          tr .danger={selectedId === row.id} data-label={row.label}
            td {row.id} class='col-md-1'
            td class='col-md-4'
              a {row.label} onclick={() => select(row.id)}
            td class='col-md-1'
              a onclick={() => remove(row.id)}
                span class='glyphicon glyphicon-remove' aria-hidden='true'
            td class='col-md-6'
    span class='preloadicon glyphicon glyphicon-remove' aria-hidden='true'
  `;
}
