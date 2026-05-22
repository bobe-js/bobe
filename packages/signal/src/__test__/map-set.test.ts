import { $, effectUt as effect } from '#/index';
import { Mock } from 'vitest';

describe('Map reactivity', () => {
  let map: any;
  let effectSpy: Mock;

  describe('Map size', () => {
    beforeEach(() => {
      map = $(new Map([['a', 1], ['b', 2]]));
      effectSpy = vi.fn();
    });

    it('should read size correctly', () => {
      expect(map.size).toBe(2);
    });

    it('should track size and re-trigger when adding new key', () => {
      effect(() => {
        effectSpy(map.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(2);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(3);
    });

    it('should track size and re-trigger when deleting key', () => {
      effect(() => {
        effectSpy(map.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      map.delete('a');
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(1);
    });

    it('should track size and re-trigger after clear', () => {
      effect(() => {
        effectSpy(map.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      map.clear();
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(0);
    });
  });

  describe('Map.get / Map.set', () => {
    beforeEach(() => {
      map = $(new Map([['x', 10]]));
      effectSpy = vi.fn();
    });

    it('should get value correctly', () => {
      expect(map.get('x')).toBe(10);
    });

    it('should get undefined for missing key', () => {
      expect(map.get('missing')).toBe(undefined);
    });

    it('should track get and re-trigger when setting existing key', () => {
      effect(() => {
        effectSpy(map.get('x'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(10);

      map.set('x', 999);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(999);
    });

    it('should track get and re-trigger when key goes from nonexistent to existent', () => {
      effect(() => {
        effectSpy(map.get('newKey'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(undefined);

      map.set('newKey', 'hello');
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith('hello');
    });
  });

  describe('Map.has', () => {
    beforeEach(() => {
      map = $(new Map([['a', 1]]));
      effectSpy = vi.fn();
    });

    it('should return true for existing key', () => {
      expect(map.has('a')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(map.has('b')).toBe(false);
    });

    it('should track has and re-trigger when key is deleted', () => {
      effect(() => {
        effectSpy(map.has('a'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(true);

      map.delete('a');
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(false);
    });

    it('should track has and re-trigger when key is added', () => {
      effect(() => {
        effectSpy(map.has('b'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(false);

      map.set('b', 100);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(true);
    });
  });

  describe('Map.delete', () => {
    it('should delete key and return true', () => {
      map = $(new Map([['a', 1]]));
      const result = map.delete('a');
      expect(result).toBe(true);
      expect(map.has('a')).toBe(false);
    });
  });

  describe('Map iteration', () => {
    beforeEach(() => {
      map = $(new Map([['a', 1], ['b', 2]]));
      effectSpy = vi.fn();
    });

    it('should track forEach and re-trigger when adding key', () => {
      effect(() => {
        const items: any[] = [];
        map.forEach((v: any, k: any) => items.push([k, v]));
        effectSpy(items);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 1], ['b', 2]]);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 1], ['b', 2], ['c', 3]]);
    });

    it('should track keys() and re-trigger', () => {
      effect(() => {
        const keys = [...map.keys()];
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    });

    it('should track values() and re-trigger', () => {
      effect(() => {
        const values = [...map.values()];
        effectSpy(values);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([1, 2, 3]);
    });

    it('should track entries() and re-trigger', () => {
      effect(() => {
        const entries = [...map.entries()];
        effectSpy(entries);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 1], ['b', 2], ['c', 3]]);
    });

    it('should track Symbol.iterator and re-trigger', () => {
      effect(() => {
        const items = [...map];
        effectSpy(items);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 1], ['b', 2]]);

      map.set('c', 3);
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('should re-trigger forEach when modifying an existing value', () => {
      effect(() => {
        const items: any[] = [];
        map.forEach((v: any, k: any) => items.push([k, v]));
        effectSpy(items);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 1], ['b', 2]]);

      map.set('a', 100);

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([['a', 100], ['b', 2]]);
    });
  });

  describe('Map key deep reactivity in iteration', () => {
    it('entries() should return reactive keys (deeply wrapped)', () => {
      const keyObj = { id: 1, name: 'original' };
      map = $(new Map([[keyObj, 'val1']]));
      effectSpy = vi.fn();

      effect(() => {
        const entries = [...map.entries()];
        const key = entries[0][0];
        effectSpy(key.name);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith('original');

      // entries 返回的 key 是 deepSignal 包装的，修改其属性应触发 effect
      const proxyKey = [...map.keys()][0];
      proxyKey.name = 'updated';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith('updated');
    });

    it('forEach should provide reactive keys (deeply wrapped)', () => {
      const keyObj = { id: 1, label: 'old' };
      map = $(new Map([[keyObj, 'val1']]));
      effectSpy = vi.fn();

      effect(() => {
        const keys: any[] = [];
        map.forEach((_v: any, k: any) => {
          keys.push(k);
          effectSpy(k.label);
        });
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith('old');

      const proxyKey = [...map.keys()][0];
      proxyKey.label = 'new';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith('new');
    });
  });
});

describe('Set reactivity', () => {
  let set: any;
  let effectSpy: Mock;

  describe('Set size', () => {
    beforeEach(() => {
      set = $(new Set([1, 2, 3]));
      effectSpy = vi.fn();
    });

    it('should read size correctly', () => {
      expect(set.size).toBe(3);
    });

    it('should track size and re-trigger when adding value', () => {
      effect(() => {
        effectSpy(set.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(3);

      set.add(4);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(4);
    });

    it('should track size and re-trigger when deleting value', () => {
      effect(() => {
        effectSpy(set.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      set.delete(1);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(2);
    });
  });

  describe('Set.has / Set.add / Set.delete', () => {
    beforeEach(() => {
      set = $(new Set(['a', 'b']));
      effectSpy = vi.fn();
    });

    it('should return true for existing value', () => {
      expect(set.has('a')).toBe(true);
    });

    it('should track has and re-trigger when value is added', () => {
      effect(() => {
        effectSpy(set.has('c'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(false);

      set.add('c');
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(true);
    });

    it('should track has and re-trigger when value is deleted', () => {
      effect(() => {
        effectSpy(set.has('b'));
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(true);

      set.delete('b');
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(false);
    });

    it('should not re-trigger on add the same value (idempotent)', () => {
      effect(() => {
        effectSpy(set.size);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(2);

      set.add('a'); // already exists
      expect(effectSpy).toHaveBeenCalledTimes(1); // should NOT re-trigger
    });
  });

  describe('Set iteration', () => {
    beforeEach(() => {
      set = $(new Set([10, 20]));
      effectSpy = vi.fn();
    });

    it('should track forEach and re-trigger', () => {
      effect(() => {
        const items: any[] = [];
        set.forEach((v: any) => items.push(v));
        effectSpy(items);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([10, 20]);

      set.add(30);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([10, 20, 30]);
    });

    it('should track Symbol.iterator (as values) and re-trigger', () => {
      effect(() => {
        const items = [...set];
        effectSpy(items);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([10, 20]);

      set.add(30);
      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([10, 20, 30]);
    });

    it('should track values() and re-trigger', () => {
      effect(() => {
        const values = [...set.values()];
        effectSpy(values);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      set.add(30);
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });

    it('should track keys() (alias for values in Set) and re-trigger', () => {
      effect(() => {
        const keys = [...set.keys()];
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      set.add(30);
      expect(effectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Map/Set custom property', () => {
    it('should support custom properties on Map proxy', () => {
      const m = $(Object.assign(new Map(), { customProp: 'hello' }));
      expect(m.customProp).toBe('hello');
    });
  });
});
