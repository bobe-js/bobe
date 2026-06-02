/** 通过 globalThis 传递的路由全局变量名 */
export enum GlobalKey {
  /** 路由表：{ [url]: { import/component } } */
  Routes = '__BOBE_INIT_ROUTES__',
  /** 菜单树：Menu[] */
  Menus = '__BOBE_INIT_MENUS__',
  /** 初始路径 */
  Path = '__BOBE_INIT_PATH__',
}
