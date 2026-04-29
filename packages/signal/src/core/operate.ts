import { setPulling, getPulling } from './global';
import { Effect } from './effect';
import { Signal } from './signal';
import { Link, SideEffect, OutLink, SignalNode, OnClean, ScheduleType } from './type';
import { State, DirtyState, PullingOrScopeExecuted, ScopeAbort } from './macro' with { type: 'macro' };
import { multiScheduler } from './schedule';
import { micro } from '#/util';

export function mark(signal: Signal) {
  let line = signal.emitHead;
  while (line) {
    const down = line.down as Effect;
    const { scope, emitHead, state } = down;
    // if ((scope && scope.state & State.ScopeAbort) || down === up.scope || state & ScopeExecuted) {
    // }
    if (scope && scope.state & State.ScopeAbort) {
    } else {
      const notLocked = (state & State.PullLock) === 0;
      down.state |= notLocked ? State.NeedCompute : State.PullingNeedCompute;
      // window['mark'] = (window['mark'] || 0) + 1;
      if (state & State.IsScope) {
        if (notLocked && state & State.IsEffect) {
          if (down.type === ScheduleType.Sync) {
            addEffect(down);
          } else {
            multiScheduler.addTask(down.type, down);
          }
        }
      } else if (emitHead) {
        markUnknownDeep(emitHead);
      }
    }
    line = line.nextEmitLine;
  }
}

function markUnknownDeep(initialLine: Link) {
  const noPulling = !getPulling();
  // 初始节点入栈
  const stack: Link[] = [initialLine];
  let len = 1;

  while (len > 0) {
    // 手动出栈，不触发数组缩容
    let line: Link = stack[--len];
    stack[len] = null as any;

    while (line) {
      const down = line.down as Effect;
      const { state, scope } = down;
      // 判定逻辑
      // const noSkip = !(
      //   (scope && scope.state & State.ScopeAbort) ||
      //   down === up.scope ||
      //   state & UnknownOrScopeExecuted
      // );
      // 1. 禁用，2. 已标记
      if ((scope && scope.state & State.ScopeAbort) || (noPulling && state & DirtyState)) {
      } else {
        const notLocked = (state & State.PullLock) === 0;
        down.state |= notLocked ? State.Unknown : State.PullingUnknown;
        // window['mark'] = (window['mark'] || 0) + 1;
        if (state & State.IsScope) {
          if (notLocked && state & State.IsEffect) {
            if (down.type === ScheduleType.Sync) {
              addEffect(down);
            } else {
              multiScheduler.addTask(down.type, down);
            }
          }
        } else if (down.emitHead) {
          // 手动入栈
          stack[len++] = down.emitHead;
        }
      }

      line = line.nextEmitLine;
    }
  }
}

export function pullDeep(root: SideEffect): any {
  let node = root,
    top: Link = null,
    i = -1;
  const lineStack: Link[] = [];
  do {
    const { state, scope } = node;
    let noSkipSelf = !(
      state & PullingOrScopeExecuted ||
      (state & DirtyState) === 0 ||
      (scope && scope.state & State.ScopeAbort)
    );
    // begin
    const firstLine = node.recHead;
    // 1. 本节点不跳过则可进入子节点,
    // 2. 本节点需要计算，不需要进入子节点
    if (noSkipSelf) {
      node.state |= State.PullLock;
      if ((state & State.NeedCompute) === 0 && firstLine) {
        node = firstLine.up as SideEffect;
        lineStack[++i] = top;
        top = firstLine;
        continue;
      }
    }

    do {
      const { state } = node;
      let noGoSibling = false;
      if (noSkipSelf) {
        // 子节点计算完成后重新查看父节点的 NeedCompute
        if (state & State.NeedCompute) {
          // window['update'] = (window['update'] || 0) + 1;
          // @ts-ignore
          const prevValue = node.value;
          const prevPulling = getPulling();
          setPulling(node);
          const value = node.get(false, false);
          setPulling(prevPulling);
          // 将父标记为 NeedCompute
          if ((noGoSibling = value !== prevValue)) {
            let line = node.emitHead;
            while (line) {
              const { down } = line;
              down.state &= ~State.Unknown;
              down.state |= State.NeedCompute;
              line = line.nextEmitLine;
            }
          }
        }
        // 不需要计算时将，将 blocked 标记释放
        else {
          transferDirtyState(node, state);
        }
        node.state &= ~State.PullLock;
      }
      // complete
      // 递归出口
      if (node === root) {
        // @ts-ignore
        return node.value;
      }
      if (!noGoSibling && top.nextRecLine) {
        top = top.nextRecLine;
        node = top.up as SideEffect;
        break;
      }
      // 避免回溯时子节点 noSkipSelf 影响到父节点
      noSkipSelf = true;
      node = top.down as SideEffect;
      top = lineStack[i];
      lineStack[i--] = null;
    } while (true);
  } while (true);
}
/**
 * 将 PullingUnknown、PullingNeedCompute
 * 转为 Unknown、NeedCompute
 * TODO: 考虑加属性 blockedSate 进行优化
 */
export function transferDirtyState(node: SideEffect, state: State) {
  // 被处理的节点应该恢复
  if (state & State.PullingUnknown) {
    node.state = (state & ~State.PullingUnknown) | State.Unknown;
  } else {
    node.state &= ~State.Unknown;
  }
  // 被处理的节点应该恢复
  if (state & State.PullingNeedCompute) {
    node.state = (state & ~State.PullingNeedCompute) | State.NeedCompute;
  } else {
    node.state &= ~State.NeedCompute;
  }
}
const effectQueue: Effect[] = [];
let consumeI = -1,
  produceI = -1;
export function addEffect(effect: Effect) {
  effectQueue[++produceI] = effect;
}
export function flushSyncEffect() {
  // 正在消费
  if (consumeI !== -1) {
    return;
  }
  while (++consumeI <= produceI) {
    const effect = effectQueue[consumeI];
    if (effect.state | DirtyState) {
      effect.get();
    }
    effectQueue[consumeI] = null;
  }
  consumeI = -1;
  produceI = -1;
}

export function flushMicroEffect() {
  if (multiScheduler.hasTask) {
    micro(() => {
      multiScheduler.flushAllTask();
    });
  }
}

let _batchDeep = 0;
export const batchStart = () => _batchDeep++;
export const batchEnd = () => {
  _batchDeep--;
  if (_batchDeep === 0) {
    flushSyncEffect();
    flushMicroEffect();
  }
};
/** effect、computed 回调执行的唯一 id
 * 用于判断重复依赖属于同一 effect、effect、computed
 */
export const batchDeep = () => _batchDeep;

export function unlink(line: OutLink, deep: boolean) {
  // window['unlink'] = (window['unlink'] || 0) + 1;
  const { nextEmitLine, prevEmitLine, nextRecLine, prevRecLine, up, down, prevOutLink, nextOutLink } = line;
  const { scope } = down;
  // 1. 非唯一 emitLine, 直接释放即可
  /*----------------- 从 up 中移除 -----------------*/
  if (prevEmitLine) {
    prevEmitLine.nextEmitLine = nextEmitLine;
  } else {
    // 头移除
    up.emitHead = nextEmitLine;
  }
  if (nextEmitLine) {
    nextEmitLine.prevEmitLine = prevEmitLine;
  } else {
    // 尾移除
    up.emitTail = prevEmitLine;
  }
  /*----------------- 从 down 中移除 -----------------*/
  if (prevRecLine) {
    prevRecLine.nextRecLine = nextRecLine;
  } else {
    // 头移除
    down.recHead = nextRecLine;
  }
  if (nextRecLine) {
    nextRecLine.prevRecLine = prevRecLine;
  } else {
    // 尾移除
    down.recTail = prevRecLine;
  }
  /*----------------- 从 outLink 中移除 -----------------*/
  if (prevOutLink) {
    prevOutLink.nextOutLink = nextOutLink;
  }
  if (nextOutLink) {
    nextOutLink.prevOutLink = prevOutLink;
  }
  if (scope && scope.outLink === line) {
    scope.outLink = nextOutLink;
  }
  if (up.state & State.IsScope) {
    // @ts-ignore
    up.dispose();
    // dispose(up as Effect);
  }
  // 唯一 emitLine, 现在 up 是游离节点，递归删除 up 的上游依赖
  else if (deep && !prevEmitLine && !nextEmitLine) {
    let { recHead: line } = up as Effect;
    // 如果 up 节点上面也有 唯一 emitLine 继续释放
    while (line) {
      const next = line.nextRecLine;
      unlink(line as OutLink, true);
      line = next;
    }
  }
}

export function dispose(this: SideEffect) {
  // window['dispose'] = (window['dispose'] || 0) + 1;
  let { recHead: toDel, emitHead } = this;
  while (toDel) {
    const { up, nextRecLine } = toDel;
    // 上游非 scope 直接 unlink
    if ((up.state & State.IsScope) === 0) {
      unlink(toDel as OutLink, true);
      toDel = nextRecLine;
      continue;
    }
    let node = up,
      top: Link = null,
      i = -1;
    const lineStack: Link[] = [];
    outer: do {
      let noSkipSelf = node.state & State.IsScope && (node.state & ScopeAbort) === 0;
      const firstLine = node.recHead;

      if (noSkipSelf && firstLine) {
        node = firstLine.up as SideEffect;
        lineStack[++i] = top;
        top = firstLine;
        continue;
      }
      do {
        if (noSkipSelf) {
          releaseScope(node as Effect);
        }
        // 递归出口
        if (node === up) {
          break outer;
        }
        if (top.nextRecLine) {
          top = top.nextRecLine;
          node = top.up as SideEffect;
          break;
        }
        noSkipSelf = true;
        node = top.down as SideEffect;
        top = lineStack[i];
        lineStack[i--] = null;
      } while (true);
    } while (true);
    toDel = nextRecLine;
  }
  releaseScope(this as Effect);
  if (emitHead) unlink(emitHead as OutLink, false);
}

export function clean(onClean: OnClean) {
  const current = getPulling() as Effect;
  current.clean = onClean;
}

function releaseScope(scope: Effect) {
  let { outLink } = scope;
  while (outLink) {
    const next = outLink.nextOutLink;
    unlink(outLink, true);
    outLink = next;
  }
  scope.state |= State.ScopeAbort;
  // clean 在 scope 释放时执行
  scope.clean?.(true);
  scope.clean = null;
}

// export function pullDeep<T>(node: SideEffect, down: SignalNode): T {
//   let { scope, state, recHead: line, emitHead: downLine } = node;
//   // @ts-ignore
//   const prevValue = node.value;
//   if (state & State.Pulling || (scope && scope.state & State.ScopeAbort) || state & ScopeExecuted) {
//     return prevValue;
//   }
//   node.state |= State.Pulling;
//   setPulling(node);
//   try {
//     // 当前无需计算 先往下查询需计算的节点
//     if ((state & State.NeedCompute) === 0) {
//       while (line) {
//         pullDeep(line.up as any, node);
//         line = line.nextRecLine;
//       }
//     }

//     // 子节点完成后重新判断父节点是否需要计算
//     if (node.state & State.NeedCompute) {
//       const value = node.get(false, false);
//       if (value !== prevValue) {
//         while (downLine) {
//           const { down } = downLine;
//           down.state &= ~State.Unknown;
//           down.state |= State.NeedCompute;
//           downLine = downLine.nextEmitLine;
//         }
//       }
//       node.state &= ~State.NeedCompute;
//       return value;
//     }
//     return prevValue;
//   } finally {
//     node.state &= ~State.Pulling;
//     setPulling(down);
//   }
// }

// function markUnknownDeep(line: Link) {
//   while (line) {
//     const { down, up } = line;
//     if (
//       (down.scope &&
//         // 所属 scope 被取消
//         (down.scope.state & State.ScopeAbort ||
//           // 下游是上游的 scope
//           down === up.scope)) ||
//       // 是 scope 节点，且处于 ready 状态，不需要重复执行
//       down.state & ScopeExecuted
//     ) {
//     } else {
//       down.state |= State.Unknown;
//       markUnknownDeep(down.emitHead);
//     }
//     line = line.nextEmitLine;
//   }
// }
