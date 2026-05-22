import { $, effectUt as effect } from '#/index';
import { Mock } from 'vitest';

describe('Object iteration - key-value traversal effect tests', () => {
  let obj: any;
  let effectSpy: Mock;

  describe('Object.keys()', () => {
    beforeEach(() => {
      obj = $({ a: 1, b: 2, c: 3 });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const keys = Object.keys(obj);
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['a', 'b', 'c']);

      obj.d = 4;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd']);
    });

    it('should collect dependency and re-trigger when deleting property', () => {
      effect(() => {
        const keys = Object.keys(obj);
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['a', 'b', 'c']);

      delete obj.b;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['a', 'c']);
    });

    it('should NOT re-trigger when only modifying existing property value (keys unchanged)', () => {
      effect(() => {
        const keys = Object.keys(obj);
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      obj.a = 100;

      // Object.keys 只收集 ownKeys 依赖，不收集每个属性的 get，
      // 所以修改已有属性的值不应触发
      expect(effectSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Object.values()', () => {
    beforeEach(() => {
      obj = $({ a: 'hello', b: 'world' });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const values = Object.values(obj);
        effectSpy(values);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['hello', 'world']);

      obj.c = 'new';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['hello', 'world', 'new']);
    });

    it('should re-trigger when modifying an existing property value', () => {
      effect(() => {
        const values = Object.values(obj);
        effectSpy(values);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['hello', 'world']);

      obj.a = 'updated';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['updated', 'world']);
    });
  });

  describe('Object.entries()', () => {
    beforeEach(() => {
      obj = $({ x: 10, y: 20 });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const entries = Object.entries(obj);
        effectSpy(entries);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([
        ['x', 10],
        ['y', 20]
      ]);

      obj.z = 30;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([
        ['x', 10],
        ['y', 20],
        ['z', 30]
      ]);
    });

    it('should re-trigger when modifying an existing property value', () => {
      effect(() => {
        const entries = Object.entries(obj);
        effectSpy(entries);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith([
        ['x', 10],
        ['y', 20]
      ]);

      obj.x = 99;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith([
        ['x', 99],
        ['y', 20]
      ]);
    });
  });

  describe('for...in loop', () => {
    beforeEach(() => {
      obj = $({ name: 'Alice', age: 25 });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const keys: string[] = [];
        for (const key in obj) {
          keys.push(key);
        }
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['name', 'age']);

      obj.city = 'NYC';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['name', 'age', 'city']);
    });

    it('should collect dependency and re-trigger when deleting property', () => {
      effect(() => {
        const keys: string[] = [];
        for (const key in obj) {
          keys.push(key);
        }
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith(['name', 'age']);

      delete obj.age;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith(['name']);
    });
  });

  describe('Reflect.ownKeys()', () => {
    beforeEach(() => {
      const sym = Symbol('test');
      obj = $({ a: 1, [sym]: 'symbol-value' });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const keys = Reflect.ownKeys(obj);
        effectSpy(keys);
      });

      const initialLen = effectSpy.mock.calls[0][0].length;
      expect(effectSpy).toHaveBeenCalledTimes(1);

      obj.b = 2;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy.mock.calls[1][0].length).toBe(initialLen + 1);
    });
  });

  describe('spread operator {...obj}', () => {
    beforeEach(() => {
      obj = $({ foo: 1, bar: 2 });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const copy = { ...obj };
        effectSpy(copy);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith({ foo: 1, bar: 2 });

      obj.baz = 3;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith({ foo: 1, bar: 2, baz: 3 });
    });

    it('should re-trigger when modifying an existing property value', () => {
      effect(() => {
        const copy = { ...obj };
        effectSpy(copy);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith({ foo: 1, bar: 2 });

      obj.foo = 100;

      expect(effectSpy).toHaveBeenCalledTimes(2);
      expect(effectSpy).toHaveBeenLastCalledWith({ foo: 100, bar: 2 });
    });
  });

  describe('JSON.stringify()', () => {
    beforeEach(() => {
      obj = $({ key1: 'val1', key2: 'val2' });
      effectSpy = vi.fn();
    });

    it('should collect dependency and re-trigger when adding new property', () => {
      effect(() => {
        const json = JSON.stringify(obj);
        effectSpy(json);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith('{"key1":"val1","key2":"val2"}');

      obj.key3 = 'val3';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      const parsed = JSON.parse(effectSpy.mock.calls[1][0]);
      expect(parsed).toEqual({ key1: 'val1', key2: 'val2', key3: 'val3' });
    });

    it('should re-trigger when modifying an existing property value', () => {
      effect(() => {
        const json = JSON.stringify(obj);
        effectSpy(json);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);
      expect(effectSpy).toHaveBeenLastCalledWith('{"key1":"val1","key2":"val2"}');

      obj.key1 = 'updated';

      expect(effectSpy).toHaveBeenCalledTimes(2);
      const parsed = JSON.parse(effectSpy.mock.calls[1][0]);
      expect(parsed.key1).toBe('updated');
    });
  });

  describe('scope isolation for object iteration', () => {
    it('should clean up iteration dependency when scope is disposed', () => {
      obj = $({ a: 1, b: 2 });
      effectSpy = vi.fn();

      const ef = effect(() => {
        const keys = Object.keys(obj);
        effectSpy(keys);
      });

      expect(effectSpy).toHaveBeenCalledTimes(1);

      ef();

      obj.c = 3;
      expect(effectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
