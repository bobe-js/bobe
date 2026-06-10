import { effect } from '#/signal-warp';
import { $ } from 'aoye';
import { Log } from '#test/log-order';

describe('signal-warp effect', () => {
  describe('auto-collect 自动收集依赖（未提供 deps）', () => {
    it('仅传 callback → 自动收集依赖', () => {
      const log = new Log();
      const s = $(1);

      effect(() => {
        log.call(`v=${s.v}`);
      });

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
      log.toBe();
    });

    it('传入 options 但无 deps → 自动收集模式', () => {
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

      log.toBe('val=true, old=null');

      // 改变信号使函数返回值变化
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

      // 改变信号但函数返回值不变
      s.v = 5;
      log.toBe();

      // 使函数返回值真正变化
      s.v = -1;
      log.toBe('val=false');
    });

    it('函数 dep 使用 Math.abs — 值变化但返回值不变', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`abs=${vd.val}`);
        },
        [() => Math.abs(s.v)]
      );

      log.toBe('abs=1');

      // Math.abs(-1) = 1，返回值相同
      s.v = -1;
      log.toBe();

      // Math.abs(2) = 2，真正变化
      s.v = 2;
      log.toBe('abs=2');
    });

    it('不相关 signal 变化不触发', () => {
      const log = new Log();
      const s1 = $(1);
      const s2 = $(100);

      effect(
        (vd) => {
          log.call(`val=${vd.val}`);
        },
        [() => s1.v]
      );

      log.toBe('val=1');

      s2.v = 200;
      log.toBe(); // s2 未被追踪

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

    it('immediate: false 不立即执行', () => {
      const log = new Log();
      const s = $(1);

      effect(
        (vd) => {
          log.call(`val=${vd.val}, old=${vd.old}`);
        },
        [() => s.v],
        { immediate: false }
      );

      log.toBe();

      s.v = 2;
      log.toBe('val=2, old=1');
    });
  });
});
