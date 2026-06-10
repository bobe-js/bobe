import { bobe, Store } from "bobe";
import MenuComp from "../components/menu";

export default class Layout extends Store {
  children = null;
  menus = [];
  ui = bobe`
    div
      ${MenuComp} name="导航" menus={menus}
    div
      {children}  
  `;
}
