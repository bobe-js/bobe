import { execId } from './global';
import { Scope } from './scope';
import { Link, OutLink, SignalNode } from './type';
import { State } from './macro' with { type: 'macro' };
import { Effect } from './effect';
export function link(
  /** 上游顶点 */
  up: SignalNode = null,
  /** 下游顶点 */
  down: SignalNode = null
) {
  const { emitTail: prevEmitLine, scope: scopeUp } = up;
  let { recHead, recTail, scope: scopeDown } = down;
  // 符合外链规则，使用 outLink 进行连接
  if (scopeDown && scopeDown !== scopeUp && (up.state & State.IsScope) === 0) {
    outLink(up, down);
    return;
  }
  const nextRec = recTail ? recTail.nextRecLine : recHead;
  const eid = execId();
  // 重复依赖 跳过
  if (prevEmitLine && prevEmitLine.down === down && prevEmitLine.execId === eid) {
    return;
  }

  // 1. down 无 nextRec 尾插
  if (!nextRec) {
    // window['link'] = (window['link'] || 0) + 1;
    // 是 1. 上游节点尾指针 2.下游节点的首尾指针
    const line: Link = {
      execId: eid,
      up,
      down,
      prevEmitLine,
      nextEmitLine: null,
      prevRecLine: recTail,
      nextRecLine: null
    };
    // 加入 up 的链表
    if (prevEmitLine) {
      prevEmitLine.nextEmitLine = line;
    } else {
      up.emitHead = line;
    }
    up.emitTail = line;

    // 加入 down 的链表
    if (recTail) {
      recTail.nextRecLine = line;
    } else {
      down.recHead = line;
    }
    down.recTail = line;
    return;
  }

  // 2. 如果下一个 rec 连接的就是 up，直接复用
  if (nextRec.up === up) {
    nextRec.execId = eid;
    down.recTail = nextRec;
    return;
  }
  // window['link'] = (window['link'] || 0) + 1;
  // 3. rec 指向不匹配, 在 tail 和 next 中间插入 line
  const line: Link = {
    execId: eid,
    up,
    down,
    prevEmitLine,
    nextEmitLine: null,
    prevRecLine: recTail,
    nextRecLine: nextRec
  };
  // 加入 up 的链表
  if (prevEmitLine) {
    prevEmitLine.nextEmitLine = line;
  } else {
    up.emitHead = line;
  }
  up.emitTail = line;

  // 加入 down 链表, 一定不是尾插，只考虑是否头插
  if (recHead) {
    recTail.nextRecLine = line;
  } else {
    down.recHead = line;
  }
  // 移动 recTail
  down.recTail = line;
  // tail <-> line <-> nextRec
  if (recTail) recTail.nextRecLine = line;
  nextRec.prevRecLine = line;
}

export function outLink(
  /** 上游顶点 */
  up: SignalNode = null,
  /** 下游顶点 */
  down: SignalNode = null
) {
  const { emitTail: prevEmitLine } = up;
  let { recHead, recTail, scope: scopeDown } = down;
  const nextRec = recTail ? recTail.nextRecLine : recHead;
  // 1. down 无 nextRec 尾插
  if (!nextRec) {
    // 是 1. 上游节点尾指针 2.下游节点的首尾指针
    const line: OutLink = {
      execId: execId(),
      up,
      down,
      prevEmitLine,
      nextEmitLine: null,
      prevRecLine: recTail,
      nextRecLine: null,
      nextOutLink: null,
      prevOutLink: null
    };

    // 加入 up 的链表
    if (prevEmitLine) {
      prevEmitLine.nextEmitLine = line;
    } else {
      up.emitHead = line;
    }
    up.emitTail = line;

    // 加入 down 的链表
    if (recTail) {
      recTail.nextRecLine = line;
    } else {
      down.recHead = line;
    }
    down.recTail = line;
    // if (scopeDown && scopeDown !== scopeUp && (up.state & State.IsScope) == 0)
    makeOutLink(scopeDown, line);
    return;
  }

  // 2. 如果下一个 rec 连接的就是 up，直接复用
  if (nextRec.up === up) {
    down.recTail = nextRec;
    return;
  }
  // 3. rec 指向不匹配, 在 tail 和 next 中间插入 line
  const line: OutLink = {
    execId: execId(),
    up,
    down,
    prevEmitLine,
    nextEmitLine: null,
    prevRecLine: recTail,
    nextRecLine: nextRec,
    nextOutLink: null,
    prevOutLink: null
  };
  // 加入 up 的链表
  if (prevEmitLine) {
    prevEmitLine.nextEmitLine = line;
  } else {
    up.emitHead = line;
  }
  up.emitTail = line;

  // 加入 down 链表, 一定不是尾插，只考虑是否头插
  if (recHead) {
    recTail.nextRecLine = line;
  } else {
    down.recHead = line;
  }
  // 移动 recTail
  down.recTail = line;
  // tail <-> line <-> nextRec
  if (recTail) recTail.nextRecLine = line;
  nextRec.prevRecLine = line;
  // if (scopeDown && scopeDown !== scopeUp && (up.state & State.IsScope) == 0)
  makeOutLink(scopeDown, line);
}

function makeOutLink(scopeDown: Effect|Scope, line: OutLink) {
  const first = scopeDown.outLink;
  if (first) {
    first.prevOutLink = line;
    line.nextOutLink = first;
  }
  scopeDown.outLink = line;
}

export function outLink2(
  /** 上游顶点 */
  up: SignalNode = null,
  /** 下游顶点 */
  down: SignalNode = null
) {
  const { emitTail: prevEmitLine, emitHead } = up;
  const { emitTail: prevRecLine, recHead, scope } = down;
  const { outLink: first } = scope;

  const line: OutLink = {
    execId: execId(),
    up,
    down,
    prevEmitLine,
    prevRecLine,
    nextEmitLine: null,
    nextRecLine: null,
    nextOutLink: first,
    prevOutLink: null
  };

  scope.outLink = line;
  if (first) {
    first.nextOutLink = line;
  }

  // 处理节点上的双向链表
  up.emitTail = line;
  down.recTail = line;

  if (!emitHead) {
    up.emitHead = line;
  }
  if (!recHead) {
    down.recHead = line;
  }
}
