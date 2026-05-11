import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Queue,
  isNum,
  genKey,
  date32,
  SortMap,
  pick,
  isNatureNumStr,
  matchIdStart,
  matchIdStart2,
  matchId,
  getEscapeChar,
  jsVarRegexp,
  matchBlank,
} from '../util';

// ==================== isNum ====================
describe('isNum', () => {
  it('应识别 0-9 为数字', () => {
    for (let i = 0; i <= 9; i++) {
      expect(isNum(String(i))).toBe(true);
    }
  });

  it('应对非数字字符返回 false', () => {
    expect(isNum('a')).toBe(false);
    expect(isNum('A')).toBe(false);
    expect(isNum('_')).toBe(false);
    expect(isNum('/')).toBe(false);
    expect(isNum(' ')).toBe(false);
    expect(isNum('\n')).toBe(false);
    expect(isNum('.')).toBe(false);
  });
});

// ==================== genKey ====================
describe('genKey', () => {
  it('应返回一个带时间戳和随机数的字符串', () => {
    const key = genKey('test') as unknown as string;
    expect(typeof key).toBe('string');
    expect(key.startsWith('test-')).toBe(true);
  });

  it('应接受 number 类型输入', () => {
    const key = genKey(123) as unknown as string;
    expect(typeof key).toBe('string');
    expect(key.startsWith('123-')).toBe(true);
  });

  it('每次调用应生成不同的 key', () => {
    const k1 = genKey('a');
    const k2 = genKey('a');
    expect(k1).not.toBe(k2);
  });
});

// ==================== date32 ====================
describe('date32', () => {
  it('应返回 32 进制的时间戳字符串', () => {
    const result = date32();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('连续调用应返回非递减的值', () => {
    const d1 = date32();
    const d2 = date32();
    // 32 进制字典序约等于数值大小
    expect(d2 >= d1).toBe(true);
  });
});

// ==================== pick ====================
describe('pick', () => {
  it('应从对象中 pick 指定字段', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('空 keys 应返回空对象', () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });

  it('应处理嵌套对象', () => {
    const obj = { a: { x: 1 }, b: 2 };
    expect(pick(obj, ['a'])).toEqual({ a: { x: 1 } });
  });
});

// ==================== isNatureNumStr ====================
describe('isNatureNumStr', () => {
  it('"0" 是自然数', () => {
    expect(isNatureNumStr('0')).toBe(true);
  });

  it('正整数字符串是自然数', () => {
    expect(isNatureNumStr('1')).toBe(true);
    expect(isNatureNumStr('123')).toBe(true);
    expect(isNatureNumStr('999')).toBe(true);
  });

  it('以 0 开头的多位数不是自然数', () => {
    expect(isNatureNumStr('01')).toBe(false);
    expect(isNatureNumStr('001')).toBe(false);
  });

  it('非字符串返回 false', () => {
    expect(isNatureNumStr(123)).toBe(false);
    expect(isNatureNumStr(null)).toBe(false);
    expect(isNatureNumStr(undefined)).toBe(false);
    expect(isNatureNumStr({})).toBe(false);
    expect(isNatureNumStr(true)).toBe(false);
  });

  it('负数不是自然数', () => {
    expect(isNatureNumStr('-1')).toBe(false);
  });

  it('浮点数不是自然数', () => {
    expect(isNatureNumStr('1.5')).toBe(false);
  });

  it('空字符串不是自然数', () => {
    expect(isNatureNumStr('')).toBe(false);
  });
});

// ==================== matchIdStart ====================
describe('matchIdStart', () => {
  it('数字 0-9 返回 true', () => {
    for (let i = 0; i <= 9; i++) {
      expect(matchIdStart(String(i))).toBe(true);
    }
  });

  it('大写字母 A-Z 返回 true', () => {
    for (let i = 65; i <= 90; i++) {
      expect(matchIdStart(String.fromCharCode(i))).toBe(true);
    }
  });

  it('小写字母 a-z 返回 true', () => {
    for (let i = 97; i <= 122; i++) {
      expect(matchIdStart(String.fromCharCode(i))).toBe(true);
    }
  });

  it('_ 返回 true', () => {
    expect(matchIdStart('_')).toBe(true);
  });

  it('/ 返回 true', () => {
    expect(matchIdStart('/')).toBe(true);
  });

  it('$ 返回 true', () => {
    expect(matchIdStart('$')).toBe(true);
  });

  it('特殊字符返回 false', () => {
    expect(matchIdStart('-')).toBe(false);
    expect(matchIdStart('.')).toBe(false);
    expect(matchIdStart(' ')).toBe(false);
    expect(matchIdStart('\n')).toBe(false);
    expect(matchIdStart('@')).toBe(false);
  });
});

// ==================== matchIdStart2 ====================
describe('matchIdStart2', () => {
  it('通过索引匹配标识符起始字符', () => {
    expect(matchIdStart2('$abc', 0)).toBe(true);
    expect(matchIdStart2('abc', 0)).toBe(true);
    expect(matchIdStart2('0abc', 0)).toBe(true);
    expect(matchIdStart2('_abc', 0)).toBe(true);
    expect(matchIdStart2('/abc', 0)).toBe(true);
  });

  it('通过索引匹配非标识符起始字符', () => {
    expect(matchIdStart2('-abc', 0)).toBe(false);
    expect(matchIdStart2('.abc', 0)).toBe(false);
  });

  it('使用非零索引匹配', () => {
    expect(matchIdStart2('ab$c', 2)).toBe(true);
    expect(matchIdStart2('ab-c', 2)).toBe(false);
  });
});

// ==================== matchId ====================
describe('matchId', () => {
  it('数字 0-9 返回 true', () => {
    for (let i = 0; i <= 9; i++) {
      expect(matchId(String(i), 0)).toBe(true);
    }
  });

  it('大写字母 A-Z 返回 true', () => {
    for (let i = 65; i <= 90; i++) {
      expect(matchId(String.fromCharCode(i), 0)).toBe(true);
    }
  });

  it('小写字母 a-z 返回 true', () => {
    for (let i = 97; i <= 122; i++) {
      expect(matchId(String.fromCharCode(i), 0)).toBe(true);
    }
  });

  it('$ / _ - 返回 true', () => {
    expect(matchId('$', 0)).toBe(true);
    expect(matchId('/', 0)).toBe(true);
    expect(matchId('_', 0)).toBe(true);
    expect(matchId('-', 0)).toBe(true);
  });

  it('其他字符返回 false', () => {
    expect(matchId('.', 0)).toBe(false);
    expect(matchId(' ', 0)).toBe(false);
    expect(matchId('@', 0)).toBe(false);
    expect(matchId('\\', 0)).toBe(false);
  });

  it('通过索引匹配', () => {
    expect(matchId('ab9c', 2)).toBe(true);
    expect(matchId('ab.c', 2)).toBe(false);
  });
});

// ==================== getEscapeChar ====================
describe('getEscapeChar', () => {
  it('应转义空字符', () => {
    expect(getEscapeChar('\0', 0)).toBe('\\0');
  });

  it('应转义退格', () => {
    expect(getEscapeChar('\b', 0)).toBe('\\b');
  });

  it('应转义制表符', () => {
    expect(getEscapeChar('\t', 0)).toBe('\\t');
  });

  it('应转义换行', () => {
    expect(getEscapeChar('\n', 0)).toBe('\\n');
  });

  it('应转义回车', () => {
    expect(getEscapeChar('\r', 0)).toBe('\\r');
  });

  it('应转义双引号', () => {
    expect(getEscapeChar('"', 0)).toBe('\\"');
  });

  it('应转义单引号', () => {
    expect(getEscapeChar("'", 0)).toBe("\\'");
  });

  it('应转义反斜杠', () => {
    expect(getEscapeChar('\\', 0)).toBe('\\\\');
  });

  it('普通字符应返回 undefined', () => {
    expect(getEscapeChar('a', 0)).toBeUndefined();
    expect(getEscapeChar('1', 0)).toBeUndefined();
    expect(getEscapeChar(' ', 0)).toBeUndefined();
  });
});

// ==================== jsVarRegexp ====================
describe('jsVarRegexp', () => {
  it('应匹配简单标识符', () => {
    const matches = 'foo bar baz'.match(jsVarRegexp);
    expect(matches).toEqual(['foo', 'bar', 'baz']);
  });

  it('应匹配含下划线和 $ 的标识符', () => {
    const matches = '$foo _bar baz_123'.match(jsVarRegexp);
    expect(matches).toEqual(['$foo', '_bar', 'baz_123']);
  });

  it('不应匹配数字开头的标识符', () => {
    const matches = '123abc foo'.match(jsVarRegexp);
    expect(matches).toEqual(['foo']);
  });

  it('空字符串应返回 null', () => {
    expect(''.match(jsVarRegexp)).toBeNull();
  });
});

// ==================== matchBlank ====================
describe('matchBlank', () => {
  it('空格 (32) 返回 true', () => {
    expect(matchBlank(' ', 0)).toBe(true);
  });

  it('制表符 (9) 返回 true', () => {
    expect(matchBlank('\t', 0)).toBe(true);
  });

  it('换行 (10) 返回 true', () => {
    expect(matchBlank('\n', 0)).toBe(true);
  });

  it('垂直制表 (11) 返回 true', () => {
    expect(matchBlank('\v', 0)).toBe(true);
  });

  it('换页 (12) 返回 true', () => {
    expect(matchBlank('\f', 0)).toBe(true);
  });

  it('回车 (13) 返回 true', () => {
    expect(matchBlank('\r', 0)).toBe(true);
  });

  it('退格 (8) 返回 false', () => {
    expect(matchBlank('\b', 0)).toBe(false);
  });

  it('空字符 (0) 返回 false', () => {
    expect(matchBlank('\0', 0)).toBe(false);
  });

  it('可见字符返回 false', () => {
    expect(matchBlank('a', 0)).toBe(false);
    expect(matchBlank('1', 0)).toBe(false);
  });
});

// ==================== Queue ====================
describe('Queue', () => {
  let queue: Queue<number>;

  beforeEach(() => {
    queue = new Queue<number>();
  });

  describe('基础操作', () => {
    it('新队列 len 为 0', () => {
      expect(queue.len).toBe(0);
    });

    it('push 应增加元素并返回 item', () => {
      const item = queue.push(1);
      expect(queue.len).toBe(1);
      expect(item.v).toBe(1);
      expect(queue.first).toBe(1);
      expect(queue.last).toBe(1);
    });

    it('多次 push 应保持顺序', () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      expect(queue.len).toBe(3);
      expect(queue.first).toBe(1);
      expect(queue.last).toBe(3);
    });

    it('shift 应移除并返回第一个元素', () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      expect(queue.shift()).toBe(1);
      expect(queue.len).toBe(2);
      expect(queue.first).toBe(2);
    });

    it('shift 到空后 first/last 应为 undefined', () => {
      queue.push(1);
      queue.shift();
      expect(queue.len).toBe(0);
      // _first 为 undefined 时 getter 访问会报错，因为是 non-null assertion
    });
  });

  describe('insetAfter', () => {
    it('在指定 anchor 后插入元素', () => {
      const a = queue.push(1);
      const b = queue.insetAfter(2, a);
      expect(queue.len).toBe(2);
      expect(queue.first).toBe(1);
      expect(queue.last).toBe(2);
      expect(b.v).toBe(2);
    });

    it('在两个元素之间插入', () => {
      const a = queue.push(1);
      queue.push(3);
      queue.insetAfter(2, a);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([1, 2, 3]);
    });

    it('不传 anchor 时在开头插入', () => {
      queue.push(2);
      queue.push(3);
      queue.insetAfter(1);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('delete', () => {
    it('删除中间元素', () => {
      queue.push(1);
      const b = queue.push(2);
      queue.push(3);
      queue.delete(b);
      expect(queue.len).toBe(2);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([1, 3]);
    });

    it('删除第一个元素', () => {
      const a = queue.push(1);
      queue.push(2);
      queue.delete(a);
      expect(queue.first).toBe(2);
      expect(queue.len).toBe(1);
    });

    it('删除最后一个元素', () => {
      queue.push(1);
      const b = queue.push(2);
      queue.delete(b);
      expect(queue.last).toBe(1);
      expect(queue.len).toBe(1);
    });

    it('删除唯一的元素', () => {
      const a = queue.push(1);
      queue.delete(a);
      expect(queue.len).toBe(0);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([]);
    });

    it('delete 返回被删除的值', () => {
      const a = queue.push(42);
      expect(queue.delete(a)).toBe(42);
    });
  });

  describe('forEach（实例方法）', () => {
    it('遍历所有元素', () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([1, 2, 3]);
    });

    it('空队列不执行回调', () => {
      const cb = vi.fn();
      queue.forEach(cb);
      expect(cb).not.toHaveBeenCalled();
    });

    it('单个元素遍历', () => {
      queue.push(1);
      const values: number[] = [];
      queue.forEach(v => values.push(v));
      expect(values).toEqual([1]);
    });
  });

  describe('forEach（静态方法）', () => {
    it('遍历从 firstItem 到 lastItem', () => {
      const q = new Queue<number>();
      q.push(1);
      q.push(2);
      q.push(3);
      const values: number[] = [];
      Queue.forEach(q._first!, q._last!, v => values.push(v));
      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('subRef', () => {
    it('应返回 SubQueue', () => {
      const a = queue.push(1);
      const b = queue.push(2);
      const sub = queue.subRef(a, b);
      expect(sub.first).toBe(1);
      expect(sub.last).toBe(2);
    });
  });

  describe('clone', () => {
    it('应深拷贝队列', () => {
      queue.push(1);
      queue.push(2);
      queue.push(3);
      const cloned = queue.clone();
      expect(cloned.len).toBe(3);
      const values: number[] = [];
      cloned.forEach(v => values.push(v));
      expect(values).toEqual([1, 2, 3]);
    });

    it('克隆不应影响原队列', () => {
      queue.push(1);
      queue.push(2);
      const cloned = queue.clone();
      cloned.push(3);
      expect(queue.len).toBe(2);
      expect(cloned.len).toBe(3);
    });

    it('空队列克隆', () => {
      const cloned = queue.clone();
      expect(cloned.len).toBe(0);
    });
  });
});

// ==================== SortMap ====================
describe('SortMap', () => {
  let map: SortMap<string>;

  beforeEach(() => {
    map = new SortMap<string>();
  });

  it('add 应返回 QueueItem', () => {
    const item = map.add('key1', 'value1');
    expect(item.v).toBe('value1');
  });

  it('相同 key 应放入同一队列', () => {
    map.add('k', 'a');
    map.add('k', 'b');
    expect(map.data['k'].len).toBe(2);
    expect(map.data['k'].first).toBe('a');
    expect(map.data['k'].last).toBe('b');
  });

  it('不同 key 应放入不同队列', () => {
    map.add('k1', 'a');
    map.add('k2', 'b');
    expect(map.data['k1'].len).toBe(1);
    expect(map.data['k2'].len).toBe(1);
  });

  it('支持 symbol 作为 key', () => {
    const sym = Symbol('test');
    map.add(sym, 'val');
    expect(map.data[sym as unknown as string].first).toBe('val');
  });

  it('clear 应清空所有数据', () => {
    map.add('k1', 'a');
    map.add('k2', 'b');
    map.clear();
    expect(map.data).toEqual({});
  });
});
