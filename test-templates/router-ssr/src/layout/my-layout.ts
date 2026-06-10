import { bobe, Store } from "bobe";
import MenuComp from "../components/menu";

export default class MyLayout extends Store {
  children = null;
  menus = [];
  ui = bobe`
    div
      ${MenuComp} name="🤡" menus={menus}
    div
      {children}
  `;
}
