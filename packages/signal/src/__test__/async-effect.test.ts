import { $, effectUt as effect, batchStart, batchEnd } from '#/index';
import { Log } from '#test/log-order';

describe('async effect 调度测试', () => {
  describe('基本调度类型', () => {
    it('Sync：signal 变化后同步执行 Effect', () => {
      const log = new Log();
      const s = $(1);

      effect(
        () => {
          log.call(`v=${s.v}`);
        },
        { type: 'sync' }
      );

      log.toBe('v=1');

      s.v = 2;
      log.toBe('v=2');

      s.v = 3;
      log.toBe('v=3');
    });

    it('Pre：signal 变化后在微任务中执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`v=${s.v}`);
          },
          { type: 'pre' }
        );

        log.toBe('v=1');

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=2');
          done(1);
        });
      }));

    it('Render：signal 变化后在微任务中执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`v=${s.v}`);
          },
          { type: 'render' }
        );

        log.toBe('v=1');

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=2');
          done(1);
        });
      }));

    it('Post：signal 变化后在微任务中执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`v=${s.v}`);
          },
          { type: 'post' }
        );

        log.toBe('v=1');

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=2');
          done(1);
        });
      }));
  });

  describe('优先级顺序', () => {
    it('Pre > Render > Post，同一轮微任务中按优先级消费', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => log.call('post'), [s], { type: 'post' });
        effect(() => log.call('render'), [s], { type: 'render' });
        effect(() => log.call('pre'), [s], { type: 'pre' });

        log.toBe('post', 'render', 'pre');

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('pre', 'render', 'post');
          done(1);
        });
      }));

    it('不同信号触发不同优先级 Effect，整体仍按优先级排序', () =>
      new Promise(done => {
        const log = new Log();
        const s1 = $(1);
        const s2 = $(10);
        const s3 = $(100);

        effect(() => log.call(`post-s3=${s3.v}`), { type: 'post' });
        effect(() => log.call(`render-s2=${s2.v}`), { type: 'render' });
        effect(() => log.call(`pre-s1=${s1.v}`), { type: 'pre' });

        log.toBe('post-s3=100', 'render-s2=10', 'pre-s1=1');

        s1.v = 11;
        s2.v = 22;
        s3.v = 33;

        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('pre-s1=11', 'render-s2=22', 'post-s3=33');
          done(1);
        });
      }));
  });

  describe('混合 Sync 与 Async', () => {
    it('Sync 立即执行，Async 在微任务中按优先级执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => log.call('sync'), [s], { type: 'sync' });
        effect(() => log.call('pre'), [s], { type: 'pre' });
        effect(() => log.call('post'), [s], { type: 'post' });

        log.toBe('sync', 'pre', 'post');

        s.v = 2;
        log.toBe('sync');

        Promise.resolve().then(() => {
          log.toBe('pre', 'post');
          done(1);
        });
      }));

    it('Sync 执行中修改 signal，Async 读取最新值', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`sync=${s.v}`);
            if (s.v < 4) {
              s.v = s.v + 1;
            }
          },
          { type: 'sync' }
        );

        effect(
          () => {
            log.call(`pre=${s.v}`);
          },
          { type: 'pre' }
        );

        log.toBe('sync=1', 'pre=2');

        s.v = 3;
        // 挨个比较时报错，报错后 Promise 完成了，导致日志变成 sync=3, pre=4
        // log.toBe('sync=3', 'sync=4');
        log.toBe('sync=3');

        Promise.resolve().then(() => {
          log.toBe('pre=4');
          done(1);
        });
      }));
  });

  describe('同一优先级多个 Effect', () => {
    it('按注册顺序 FIFO 执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => log.call('a'), [s], { type: 'pre' });
        effect(() => log.call('b'), [s], { type: 'pre' });
        effect(() => log.call('c'), [s], { type: 'pre' });

        log.toBe('a', 'b', 'c');

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('a', 'b', 'c');
          done(1);
        });
      }));
  });

  describe('不同类型的 Async Effect 互相触发', () => {
    it('Pre 类型 effect 修改信号触发 Post 类型 effect', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`pre-v=${s.v}`);
            // 在 Pre effect 中修改同一个信号，应该触发 Post effect
            if (s.v < 3) {
              s.v = s.v + 1;
            }
          },
          { type: 'pre' }
        );

        effect(
          () => {
            log.call(`post-v=${s.v}`);
          },
          { type: 'post' }
        );

        log.toBe('pre-v=1', 'post-v=2');

        s.v = 3;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('pre-v=3', 'post-v=3');
          done(1);
        });
      }));

    it('互相触发的复杂场景：每个 effect 都会影响其他信号', () =>
      new Promise(done => {
        const log = new Log();

        const signalA = $(10);
        const signalB = $(20);
        const signalC = $(30);

        effect(
          () => {
            log.call(`pre-A${signalA.v}`);
            // 修改 B 信号，触发其 effect
            signalB.v = signalA.v * 2;
          },
          { type: 'pre' }
        );

        effect(
          () => {
            log.call(`render-B${signalB.v}`);
            // 修改 C 信号，触发其 effect
            signalC.v = signalB.v + 5;
          },
          { type: 'render' }
        );

        effect(
          () => {
            log.call(`post-C${signalC.v}`);
            // 修改 A 信号，触发 Pre effect
            if (signalC.v > 30) {
              signalA.v = signalC.v - 10;
            }
          },
          { type: 'post' }
        );

        log.toBe('pre-A10', 'render-B20', 'post-C25');

        // 开始一个变化，触发连锁反应
        signalA.v = 5;
        log.toBe();

        Promise.resolve().then(() => {
          // A=5 -> B=10 -> C=15 -> A=5 (不会再次触发，因为已经稳定)
          // 实际上是 A=5 -> B=10 -> C=15 -> A=5 -> B=10 -> C=15 (但系统应避免无限循环)
          log.toBe('pre-A5', 'render-B10', 'post-C15');
          done(1);
        });
      }));
  });

  describe('batch 批处理', () => {
    it('batch 中修改 signal，batchEnd 后才执行 Sync Effect', () => {
      const log = new Log();
      const s = $(1);

      effect(() => log.call(`sync=${s.v}`), { type: 'sync' });

      log.toBe('sync=1');

      batchStart();
      s.v = 2;
      s.v = 3;
      log.toBe();
      batchEnd();
      log.toBe('sync=3');
    });

    it('batch 中混合 Sync 和 Async，batchEnd 后 Sync 立即执行，Async 在微任务', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => log.call('sync'), [s], { type: 'sync' });
        effect(() => log.call('pre'), [s], { type: 'pre' });

        log.toBe('sync', 'pre');

        batchStart();
        s.v = 2;
        log.toBe();
        batchEnd();
        log.toBe('sync');

        Promise.resolve().then(() => {
          log.toBe('pre');
          done(1);
        });
      }));

    it('batch 中 Async 也延迟到 batchEnd 后才调度', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => log.call(`pre=${s.v}`), { type: 'pre' });

        log.toBe('pre=1');

        batchStart();
        s.v = 2;
        log.toBe();
        // 此时 async effect 还未被调度，因为 batchDeep > 0
        batchEnd();

        Promise.resolve().then(() => {
          log.toBe('pre=2');
          done(1);
        });
      }));
  });

  describe('watch 模式 + 异步调度', () => {
    it('watch 指定依赖 + Pre 调度 + immediate=false', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          ({ val, old }) => {
            log.call(`val=${val}, old=${old}`);
          },
          [s],
          { type: 'pre', immediate: false }
        );

        log.toBe();

        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('val=2, old=1');
          done(1);
        });
      }));

    it('watch 多个依赖 + Post 调度', () =>
      new Promise(done => {
        const log = new Log();
        const s1 = $(1);
        const s2 = $(10);

        effect(
          (v1, v2) => {
            log.call(`s1=${v1.val}, s2=${v2.val}`);
          },
          [s1, s2],
          { type: 'post', immediate: false }
        );

        log.toBe();

        s2.v = 20;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('s1=1, s2=20');
          done(1);
        });
      }));

    it('watch + Render 调度 + immediate=true', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(5);

        effect(
          ({ val }) => {
            log.call(`v=${val}`);
          },
          [s],
          { type: 'render', immediate: true }
        );

        log.toBe('v=5');

        s.v = 10;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=10');
          done(1);
        });
      }));
  });

  describe('dispose 取消异步 Effect', () => {
    it('dispose 后在微任务中不再执行', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        const dispose = effect(
          () => {
            log.call(`v=${s.v}`);
          },
          { type: 'pre' }
        );

        log.toBe('v=1');

        s.v = 2;
        dispose();
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe();
          done(1);
        });
      }));

    it('dispose 一个不影响同优先级的其他 Effect', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        const disposeA = effect(() => log.call('a'), [s], { type: 'pre' });
        effect(() => log.call('b'), [s], { type: 'pre' });

        log.toBe('a', 'b');

        s.v = 2;
        disposeA();
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('b');
          done(1);
        });
      }));
  });

  describe('多次修改 signal', () => {
    it('同一轮中多次修改，异步 Effect 只取最新值执行一次', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(
          () => {
            log.call(`v=${s.v}`);
          },
          { type: 'pre' }
        );

        log.toBe('v=1');

        s.v = 2;
        s.v = 3;
        s.v = 4;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=4');
          done(1);
        });
      }));
  });

  describe('链式依赖 + 异步调度', () => {
    it('计算属性依赖 + Pre Effect', () =>
      new Promise(done => {
        const log = new Log();
        const a = $(1);
        const b = $(() => {
          log.call('b计算');
          return a.v * 2;
        });

        effect(
          () => {
            log.call(`effect=${b.v}`);
          },
          { type: 'pre' }
        );

        log.toBe('b计算', 'effect=2');

        a.v = 3;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('b计算', 'effect=6');
          done(1);
        });
      }));

    it('多层依赖链 + Post Effect', () =>
      new Promise(done => {
        const log = new Log();
        const a = $(1);
        const b = $(() => a.v * 2);
        const c = $(() => {
          log.call('c计算');
          return b.v + 3;
        });

        effect(
          () => {
            log.call(`effect=${c.v}`);
          },
          { type: 'post' }
        );

        log.toBe('c计算', 'effect=5');

        a.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('c计算', 'effect=7');
          done(1);
        });
      }));
  });

  describe('默认调度类型', () => {
    it('不传 scheduleType 时默认 Sync', () => {
      const log = new Log();
      const s = $(1);

      effect(() => {
        log.call(`v=${s.v}`);
      });

      log.toBe('v=1');

      s.v = 2;
      log.toBe('v=2');
    });

    it('不传 scheduleType 的 watch 默认 Sync', () => {
      const log = new Log();
      const s = $(1);

      effect(
        ({ val }) => {
          log.call(`v=${val}`);
        },
        [s],
        { immediate: false }
      );

      log.toBe();

      s.v = 2;
      log.toBe('v=2');
    });
  });

  describe('flushMicroEffect 去重', () => {
    it('微任务执行后状态重置，后续变更可重新调度', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);

        effect(() => {
          log.call(`v=${s.v}`);
        }, { type: 'pre' });

        log.toBe('v=1');

        // 第一轮
        s.v = 2;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('v=2');

          // 第二轮：状态必须已在回调末尾重置为 Idle
          s.v = 3;
          log.toBe();

          Promise.resolve().then(() => {
            log.toBe('v=3');
            done(1);
          });
        });
      })
    );

    it('Effect 执行期间触发的 Effect 在同一微任务中完成', () =>
      new Promise(done => {
        const log = new Log();
        const s = $(1);
        const s2 = $(10);

        effect(() => {
          log.call(`A=${s.v}`);
          if (s.v > 1) {
            s2.v = s.v * 2;
            // s2.set() 内部调用 flushMicroEffect()，此时状态为 Running，被跳过
            // 但 flushAllTask 的 while 循环会消费新增的 B
          }
        }, { type: 'pre' });

        effect(() => {
          log.call(`B=${s2.v}`);
        }, { type: 'pre' });

        log.toBe('A=1', 'B=10');

        s.v = 3;
        log.toBe();

        Promise.resolve().then(() => {
          log.toBe('A=3', 'B=6');
          done(1);
        });
      })
    );
  });
});
