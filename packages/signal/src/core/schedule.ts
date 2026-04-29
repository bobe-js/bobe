import { micro } from '#/util';
import { Effect } from './effect';

export type TaskNode<T> = {
  value: T;
  next: TaskNode<T> | null;
};

export type TaskQueue<T> = {
  head: TaskNode<T> | null;
  tail: TaskNode<T> | null;
};

/** bobe 专用的调度器 */
export class MultiScheduler<T> {
  /** 二进制位表示某个队列中是否有任务 */
  hasTask = 0;
  taskMap: Record<number, TaskQueue<T>> = {};
  constructor(queueCount: number) {
    for (let i = 0; i < queueCount; i++) {
      this.taskMap[1 << i] = {
        head: null,
        tail: null
      };
    }
  }

  addTask(queueId: number, task: any) {
    const queue = this.taskMap[queueId];
    const { tail } = queue;
    const item = {
      value: task,
      next: null
    };
    if (tail) {
      tail.next = item;
    } else {
      queue.head = item;
    }
    queue.tail = item;
    this.hasTask |= queueId;
  }

  flushAllTask() {
    while (this.hasTask) {
      const { hasTask } = this;
      const highest = hasTask & (~hasTask + 1);
      const task: Effect = this.consumeTask(highest).value as any;
      task.get();
    }
  }

  consumeTask(queueId: number) {
    const queue = this.taskMap[queueId];
    const { head, tail } = queue;
    const next = head.next;
    head.next = null;
    if (head === tail) {
      queue.head = null;
      queue.tail = null;
      // 最后一项被消费，这个队列就没有任务了
      this.hasTask &= ~queueId;
    } else {
      head.next = null;
      queue.head = next;
    }
    return head;
  }
}

/** TODO: 考虑如何与 ScheduleType 对齐
 *  TODO: 考虑异步 effect 循环依赖的情况
 */
export const multiScheduler = new MultiScheduler(4);
