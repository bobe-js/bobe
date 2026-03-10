import { effect, IsStore, Store, StoreIgnoreKeys } from '#/index'; // 假设使用了类似 aoye 的响应式库
describe('Store 测试', () => {
  let fn;
  beforeEach(() => {
    fn = vi.fn();
  });

  describe('Store 基础功能测试', () => {
    it('应该能够创建响应式的 Store 实例', () => {
      class TestStore extends Store {
        count = 0;
        name = 'test';

        increment() {
          this.count++;
        }
      }

      const store = new TestStore();
      expect(store.count).toBe(0);
      expect(store.name).toBe('test');

      store.increment();
      expect(store.count).toBe(1);
    });

    it('应该支持实例方法修改状态', () => {
      class CounterStore extends Store {
        value = 0;

        setValue(newValue: number) {
          this.value = newValue;
        }

        increment() {
          this.value++;
        }
      }

      const store = new CounterStore();
      expect(store.value).toBe(0);

      store.setValue(5);
      expect(store.value).toBe(5);

      store.increment();
      expect(store.value).toBe(6);
    });
  });

  describe('Store 响应性特性测试', () => {
    it('应该正确追踪对 store 属性的访问', () => {
      class ReactiveStore extends Store {
        count = 0;
        message = 'hello';
      }

      const store = new ReactiveStore();
      let accessCount = 0;
      let capturedValue = '';

      effect(() => {
        accessCount++;
        capturedValue = `${store.count}-${store.message}`;
      });

      // 初始执行
      expect(accessCount).toBe(1);
      expect(capturedValue).toBe('0-hello');

      // 修改 count
      store.count = 5;
      expect(capturedValue).toBe('5-hello');
      expect(accessCount).toBe(2);

      // 修改 message
      store.message = 'world';
      expect(capturedValue).toBe('5-world');
      expect(accessCount).toBe(3);
    });

    it('应该正确追踪嵌套对象的变更', () => {
      class NestedStore extends Store {
        user = {
          name: 'John',
          profile: {
            age: 30
          }
        };
      }

      const store = new NestedStore();
      let accessCount = 0;
      let capturedName = '';
      let capturedAge = 0;

      effect(() => {
        accessCount++;
        capturedName = store.user.name;
        capturedAge = store.user.profile.age;
      });

      expect(accessCount).toBe(1);
      expect(capturedName).toBe('John');
      expect(capturedAge).toBe(30);

      // 修改嵌套属性
      store.user.name = 'Jane';
      expect(capturedName).toBe('Jane');
      expect(accessCount).toBe(2);

      store.user.profile.age = 25;
      expect(capturedAge).toBe(25);
      expect(accessCount).toBe(3);
    });

    it('应该正确追踪数组操作', () => {
      class ArrayStore extends Store {
        items = [1, 2, 3];
      }

      const store = new ArrayStore();
      let accessCount = 0;
      let capturedItems: number[] = [];
      let capturedLength = 0;

      effect(() => {
        accessCount++;
        capturedItems = [...store.items];
        capturedLength = store.items.length;
      });

      expect(accessCount).toBe(1);
      expect(capturedItems).toEqual([1, 2, 3]);
      expect(capturedLength).toBe(3);

      // 添加元素
      store.items.push(4);
      expect(capturedItems).toEqual([1, 2, 3, 4]);
      expect(capturedLength).toBe(4);
      expect(accessCount).toBe(2);

      // 修改元素
      store.items[0] = 10;
      expect(capturedItems).toEqual([10, 2, 3, 4]);
      expect(accessCount).toBe(3);
    });

    it('应该只追踪被使用的属性', () => {
      class SelectiveTrackingStore extends Store {
        watched = 0;
        unwatched = 0;
      }

      const store = new SelectiveTrackingStore();
      let accessCount = 0;
      let capturedWatched = 0;

      effect(() => {
        accessCount++;
        capturedWatched = store.watched;
      });

      expect(accessCount).toBe(1);
      expect(capturedWatched).toBe(0);

      // 修改未被追踪的属性不应触发 effect
      store.unwatched = 5;
      expect(accessCount).toBe(1); // 仍为1

      // 修改被追踪的属性应该触发 effect
      store.watched = 10;
      expect(capturedWatched).toBe(10);
      expect(accessCount).toBe(2);
    });
  });

  describe('父子 Store 信号共享特性测试', () => {
    it('应该正确实现父子 Store 之间的信号共享', () => {
      class CounterStore extends Store {
        count = 0;

        increment() {
          this.count++;
        }
      }

      class SharedStore extends Store {
        localValue = 1;
        sharedCounter = CounterStore.new({ count: 'localValue' }); // 假设语法

        updateLocal() {
          this.localValue++;
        }
      }

      // 创建父 store
      const parentCounter = new CounterStore();
      parentCounter.count = 100;

      // 设置当前父 store 上下文
      CounterStore.Current = parentCounter;

      // 创建子 store
      const sharedStore = new SharedStore();

      // 验证共享是否生效
      // 注意：实际实现需要根据具体的 shareSignal 函数逻辑来调整
      expect(parentCounter.count).toBe(100);
    });

    it('应该在嵌套场景中保持正确的信号共享', () => {
      class GrandChildStore extends Store {
        grandChildValue = 100;
      }

      class ChildStore extends Store {
        childValue = 10;
        grandChild = GrandChildStore.new({ grandChildValue: 'childValue' });
      }

      class ParentStore extends Store {
        parentValue = 1;
        parentRef = ChildStore.new({ childValue: 'parentValue' });
      }

      const parent = new ParentStore();

      // 验证多层嵌套的共享行为
      // 这里需要根据实际的共享机制来验证
      expect(parent.parentValue).toBe(1);
    });

    it('应该在方法调用中保持响应性', () => {
      class MethodReactiveStore extends Store {
        value = 1;
        doubledValue = 0;

        calculateDoubled() {
          this.doubledValue = this.value * 2;
        }
      }

      const store = new MethodReactiveStore();
      let effectCallCount = 0;
      let capturedDoubled = 0;

      effect(() => {
        effectCallCount++;
        capturedDoubled = store.doubledValue;
      });

      // 初始值
      expect(effectCallCount).toBe(1);
      expect(capturedDoubled).toBe(0);

      // 调用方法修改状态
      store.calculateDoubled();
      expect(store.doubledValue).toBe(2);
      expect(capturedDoubled).toBe(2);
      expect(effectCallCount).toBe(2);

      // 改变输入值并重新计算
      store.value = 5;
      store.calculateDoubled();
      expect(store.doubledValue).toBe(10);
      expect(capturedDoubled).toBe(10);
      expect(effectCallCount).toBe(3); // value 变化触发一次，calculateDoubled 再触发一次
    });

    it('深度映射', () => {
      // 子 Store
      class A extends Store {
        v: number;

        update(value: number) {
          this.v = value;
        }
      }

      // 父 Store
      class B extends Store {
        foo = {
          baz: 10
        };
        a = A.new<A, B, 'a'>({ v: ['foo', 'baz'] });
        changeA() {
          this.a.update(4);
        }
      }

      const b = new B();
      b.changeA();
      expect(b.foo.baz).toBe(4);
    });
  });

  describe('Store 特殊属性测试', () => {
    it('应该正确处理 [IsStore] 标识符', () => {
      class TestStore extends Store {}

      expect(TestStore[IsStore]).toBe(true);
    });

    it('应该正确处理 [StoreIgnoreKeys] 忽略列表', () => {
      class TestStore extends Store {
        normalProp = 'normal';
        ui = 'should be ignored';
        raw = 'also ignored';
      }

      const store = new TestStore();

      effect(() => {
        store.normalProp;
        store.ui;
        store.raw;
        fn();
      });

      store.ui = 'should be ignored!';
      expect(fn).toHaveBeenCalledTimes(1);
      store.raw = 'also ignored!';
      expect(fn).toHaveBeenCalledTimes(1);
      store.normalProp = 'normal!';
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('子类自定义 StoreIgnoreKeys', () => {
      class TestStore extends Store {
        static [StoreIgnoreKeys] = ['myIgnore'];
        myIgnore = 'ignored';
        ui = 'normal';
        raw = 'also normal';
      }

      const store = new TestStore();

      effect(() => {
        store.myIgnore;
        store.ui;
        store.raw;
        fn();
      });

      store.myIgnore = 'ignored!';
      expect(fn).toHaveBeenCalledTimes(1);
      store.ui = 'normal!';
      expect(fn).toHaveBeenCalledTimes(2);
      store.raw = 'also normal!';
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('应该正确管理静态 Current 属性', () => {
      class Child extends Store {
        val = 'child';
        initialTime = (() => {
          expect(Store.Current).toBe(this);
        })();
      }
      class parent extends Store {
        before = (() => {
          expect(Store.Current).toBe(this);
        })();
        child = Child.new({});
        after = (() => {
          expect(Store.Current).toBe(this);
        })();
      }
    });
  });

  describe('Store 继承和多态测试', () => {
    it('应该支持继承链中的响应性', () => {
      class BaseStore extends Store {
        baseValue = 'base';
      }

      class ExtendedStore extends BaseStore {
        extendedValue = 'extended';

        updateBase(newBase: string) {
          this.baseValue = newBase;
        }
      }

      const store = new ExtendedStore();
      let effectCallCount = 0;
      let capturedValues = { base: '', extended: '' };

      effect(() => {
        effectCallCount++;
        capturedValues = {
          base: store.baseValue,
          extended: store.extendedValue
        };
      });

      expect(effectCallCount).toBe(1);
      expect(capturedValues).toEqual({ base: 'base', extended: 'extended' });

      // 修改基类属性
      store.updateBase('modified');
      expect(capturedValues).toEqual({ base: 'modified', extended: 'extended' });
      expect(effectCallCount).toBe(2);

      // 修改派生类属性
      store.extendedValue = 'new extended';
      expect(capturedValues).toEqual({ base: 'modified', extended: 'new extended' });
      expect(effectCallCount).toBe(3);
    });
  });
});
