import { isStore, Keys } from "aoye";
import { UI } from "./type";
import type { Tokenizer } from "./tokenizer";

export function macInc(arr: number[]) {
  const len = arr.length;
  /** 候选者数组的尾项在 arr 中的 index */
  let candyLast = [],
    i = 0;
  while (i < len) {
    const it = arr[i];
    if (it !== -1) {
      candyLast = [i];
      break;
    }
    i++;
  }
  // i 为第一项不为 -1 的项，如果其是最后一项，直接返回，因为此时数组只有一个元素
  if (i + 1 >= len) return candyLast;

  /** 反向链表 */
  const toPrev = new Int32Array(len);

  while (i < len) {
    const target = arr[i];
    // -1 为新增项直接跳过
    if (target === -1) continue;
    // 二分查找，找到在 candyLast 中 item 的插入位置
    // 维持 0，start 小于 target， end, len-1 大于等于 target
    let start = -1,
      end = candyLast.length;
    while (start + 1 < end) {
      const mid = (start + end) >> 1;
      if (arr[candyLast[mid]] < target) {
        start = mid;
      } else {
        end = mid;
      }
    }
    // 最终 end 替换为 target
    candyLast[end] = i;
    // 匹配 i 的前项索引
    toPrev[i] = candyLast[start];
    i++;
  }

  let length = candyLast.length;
  for (let j = length - 1; j > 0; j--) {
    const prev = toPrev[candyLast[j]];
    candyLast[j - 1] = prev;
  }
  return candyLast;
}


export class InlineFragment {
  [Keys.ProxyFreeObject] = true;
  constructor(
    public snapshot: Partial<Tokenizer>,
    public data: any,
    public key: string,
    public tokenizer: Tokenizer
  ) {}
}

export const isUI = (fn: any): fn is UI => typeof fn === 'function' && fn.__BOBE_IS_UI;

export const isRenderAble = (val: any) => isStore(val) || isUI(val) || val instanceof InlineFragment

const SAFE_HANDLER: ProxyHandler<object> = {
  has: () => true,
  get: (t, k) => {
    // 返回原型上的值，缺失返回 undefined
    if (typeof k === 'symbol') return (t as any)[k];
    return k in t ? (t as any)[k] : undefined;
  },
};

/**
 * 包装 data 为 safe proxy，解决 with(data) 中访问不存在的标识符抛出
 * ReferenceError 的问题。缺失的属性返回 undefined，可选链自然兼容。
 */
export const safe = (data: any) => new Proxy(data, SAFE_HANDLER);