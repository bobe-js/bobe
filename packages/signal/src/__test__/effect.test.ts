import { $, effect } from '#/index';
import { Log } from '#test/log-order';

describe('effect 功能测试', () => {
  describe('auto-collect 自动收集依赖（未提供 deps）', () => {
    it('创建时默认执行 callback 并自动追踪依赖', () => {
      const log = new Log();
      const s = $(1);

      effect(() => {
        log.call(`v=${s.v}`);
      });

      // 默认 immediate: true，创建时立即执行
      log.toBe('v=1');
    });

    it('追踪的依赖变化时重新执行', () => {
      const log = new Log();
      const s = $(1);

      effect(() => {
        log.call(`v=${s.v}`);
      });

      log.toBe('v=1');
      s.v = 2;
      log.toBe('v=2');
      s.v = 3;
      log.toBe('v=3');
    });

    it('dispose 后不再执行', () => {
      const log = new Log();
      const s = $(1);

      const ef = effect(() => {
        log.call(`v=${s.v}`);
      });

      log.toBe('v=1');
      ef.dispose();
      s.v = 2;
      log.toBe(); // 已销毁，不再触发
    });

    it('仅追踪实际访问的依赖（动态条件分支）', () => {
      const log = new Log();
      const a = $(true);
      const b = $(1);
      const c = $(2);

      effect(() => {
        if (a.v) {
          log.call(`b=${b.v}`);
        } else {
          log.call(`c=${c.v}`);
        }
      });

      log.toBe('b=1');

      // 改变当前未追踪的 c → 不触发
      c.v = 100;
      log.toBe();

      // 改变追踪的 b → 触发
      b.v = 10;
      log.toBe('b=10');
    });

    it('支持指定 schedule type（sync/pre/render/post）', () => {
      const log = new Log();
      const s = $(1);

      effect(() => {
        log.call(`v=${s.v}`);
      }, { type: 'sync' });

      log.toBe('v=1');
      s.v = 2;
      log.toBe('v=2');
    });
  });

  describe('函数 dep — 返回值未变化不重新执行', () => {
    it('函数 dep 返回值变化时执行', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`val=${vd.val}, old=${vd.old}`);
        },
        [() => s.v > 0]
      );

      // 默认 immediate: true
      log.toBe('val=true, old=null');

      // 使函数返回值真正变化
      s.v = -1;
      log.toBe('val=false, old=true');
    });

    it('函数 dep 返回值不变时不重新执行', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`val=${vd.val}`);
        },
        [() => s.v > 0]
      );

      log.toBe('val=true');

      // 改变信号但函数返回值不变（5 > 0 仍为 true）
      s.v = 5;
      log.toBe(); // 返回值未变化，不应执行

      // 再变为另一个仍 > 0 的值
      s.v = 10;
      log.toBe(); // 返回值仍未变化，不应执行

      // 使函数返回值真正变化
      s.v = -1;
      log.toBe('val=false');
    });

    it('函数 dep 使用 Math.abs — 值变化但绝对值不变时不执行', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`abs=${vd.val}`);
        },
        [() => Math.abs(s.v)]
      );

      log.toBe('abs=1');

      // Math.abs(-1) = 1，和 Math.abs(1) = 1 相同
      s.v = -1;
      log.toBe(); // 绝对值未变化，不执行

      // Math.abs(2) = 2 → 真正变化
      s.v = 2;
      log.toBe('abs=2');
    });

    it('不相关 signal 变化不触发函数 dep 重新执行', () => {
      const log = new Log();
      const s1 = $(1);
      const s2 = $(100);

      effect(
        (vd) => {
          log.call(`val=${vd.val}`);
        },
        [() => s1.v] // 仅追踪 s1
      );

      log.toBe('val=1');

      // 改变不相关的 s2 → 不触发
      s2.v = 200;
      log.toBe();

      // 改变追踪的 s1 → 触发
      s1.v = 2;
      log.toBe('val=2');
    });

    it('多个函数 dep', () => {
      const log = new Log();
      const a = $(1);
      const b = $(10);

      effect(
        (vdA, vdB) => {
          log.call(`a=${vdA.val}, b=${vdB.val}`);
        },
        [() => a.v, () => b.v]
      );

      log.toBe('a=1, b=10');

      a.v = 2;
      log.toBe('a=2, b=10');

      b.v = 20;
      log.toBe('a=2, b=20');
    });

    it('immediate: false 时创建不立即执行', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`val=${vd.val}, old=${vd.old}`);
        },
        [() => s.v],
        { immediate: false }
      );

      // 创建时不执行
      log.toBe();

      // 首次变化时执行
      s.v = 2;
      log.toBe('val=2, old=1');
    });
  });

  describe('混合 dep（函数 + Signal 实例）', () => {
    it('函数 dep 与 Signal 实例混合使用', () => {
      const log = new Log();
      const s1 = $(1);
      const s2 = $(10);

      effect(
        (vdFn, vdSig) => {
          log.call(`fn=${vdFn.val}, sig=${vdSig.val}`);
        },
        [() => s1.v, s2.ins] // 混合：函数 dep + Signal 实例
      );

      log.toBe('fn=1, sig=10');

      // 函数 dep 追踪的 s1 变化
      s1.v = 2;
      log.toBe('fn=2, sig=10');

      // Signal 实例 dep 变化
      s2.v = 20;
      log.toBe('fn=2, sig=20');
    });

    it('混合 dep 中函数返回值不变时不执行', () => {
      const log = new Log();
      const s1 = $(1);
      const s2 = $(10);

      effect(
        (vdFn, vdSig) => {
          log.call(`fn=${vdFn.val}, sig=${vdSig.val}`);
        },
        [() => s1.v > 0, s2.ins]
      );

      log.toBe('fn=true, sig=10');

      // 改变 s1 但函数返回值不变
      s1.v = 5;
      // 函数 dep 值未变，但... Effect 的内部 callback 仍会运行？
      // Effect 在 pullDeep 中判断：Computed 值未变 → Effect 无 NeedCompute → 不执行
      log.toBe();

      // Signal 实例变化 → 应触发
      s2.v = 20;
      log.toBe('fn=true, sig=20');
    });
  });
});
