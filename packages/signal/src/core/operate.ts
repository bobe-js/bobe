import { setPulling, getPulling } from './global';
import { Effect } from './effect';
import { Signal } from './signal';
import { Link, PullingOrScopeExecuted, UnknownOrScopeExecuted, SideEffect, State, DirtyState } from './type';

export function mark(signal: Signal) {
  let line = signal.emitHead;
  while (line) {
    const { down, up } = line;
    const { scope, emitHead, state } = down;
    // if ((scope && scope.state & State.ScopeAbort) || down === up.scope || state & ScopeExecuted) {
    // }
    if (scope && scope.state & State.ScopeAbort) {
    } else {
      down.state |= state & State.PullLock ? State.PullingNeedCompute : State.NeedCompute;
      if (state & State.IsScope) {
        if (state & State.IsEffect) {
          addEffect(down as Effect);
        }
      } else if (emitHead) {
        markUnknownDeep(emitHead);
      }
    }
    line = line.nextEmitLine;
  }
}

function markUnknownDeep(initialLine: Link) {
  // 初始节点入栈
  const stack: Link[] = [initialLine];
  let len = 1;

  while (len > 0) {
    // 手动出栈，不触发数组缩容
    let line: Link = stack[--len];
    stack[len] = null as any;

    while (line) {
      const { down, up } = line;
      const { state, scope } = down;
      // 判定逻辑
      const noSkip = !(
        (scope && scope.state & State.ScopeAbort) ||
        down === up.scope ||
        state & UnknownOrScopeExecuted
      );
      if (scope && scope.state & State.ScopeAbort) {
      } else {
        down.state |= state & State.PullLock ? State.PullingUnknown : State.Unknown;
        if (state & State.IsScope) {
          if (state & State.IsEffect) {
            addEffect(down as Effect);
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
  while (true) {
    const { state, scope } = node;
    let noSkip = !(state & PullingOrScopeExecuted || (scope && scope.state & State.ScopeAbort));
    // begin
    const firstLine = node.recHead;
    // 1. 本节点不跳过则可进入子节点,
    // 2. 本节点需要计算，不需要进入子节点
    if (noSkip) {
      node.state |= State.PullLock;
      if ((state & State.NeedCompute) === 0 && firstLine) {
        node = firstLine.up as SideEffect;
        lineStack[++i] = top;
        top = firstLine;
        continue;
      }
    }

    while (true) {
      const { state } = node;
      if (noSkip) {
        // 子节点计算完成后重新查看父节点的 NeedCompute
        if (state & State.NeedCompute) {
          // @ts-ignore
          const prevValue = node.value;
          const prevPulling = getPulling();
          setPulling(node);
          const value = node.get(false, false);
          setPulling(prevPulling);
          // 将父标记为 NeedCompute
          if (value !== prevValue) {
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

      // 处理完一个节点，noSkip 要还原为 true
      noSkip = true;
      // 递归出口
      if (node === root) {
        // @ts-ignore
        return node.value;
      }
      if (top.nextRecLine) {
        top = top.nextRecLine;
      } else {
        node = top.down as SideEffect;
        top = lineStack[i];
        lineStack[i--] = null;
      }
    }
  }
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
export function flushEffect() {
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
