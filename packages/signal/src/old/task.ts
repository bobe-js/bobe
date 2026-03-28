import { evt } from './global';
import { PriorityQueue } from './priority-queue';
import { CreateTaskProps, Task, TaskControlReturn } from './type';

const DefaultTaskControlReturn: TaskControlReturn = {
  finished: true,
  startNewCallbackAble: true
};

/** TODO: 支持配置是否继续在同一任务中完成后续任务 */
export class TaskQueue {
  constructor(
    public callbackAble: CreateTaskProps['callbackAble'],
    public aIsUrgent: CreateTaskProps['aIsUrgent']
  ) {}
  isScheduling = false;
  taskQueue: PriorityQueue<Task>;
  static create({ callbackAble, aIsUrgent }: CreateTaskProps) {
    const queue = new TaskQueue(callbackAble, aIsUrgent);
    queue.taskQueue = new PriorityQueue<Task>(aIsUrgent);
    return queue;
  }

  pushTask(task: Task) {
    const { taskQueue, isScheduling } = this;
    taskQueue._add(task);
    if (!isScheduling) {
      this.callbackAble(this.scheduleTask.bind(this));
      this.isScheduling = true;
    }
  }

  scheduleTask() {
    const { taskQueue } = this;
    // console.log('调度 dispose');
    const fn = taskQueue.peek();
    if (!fn) return (this.isScheduling = false);

    let info: TaskControlReturn = fn() || {};
    info = { ...DefaultTaskControlReturn, ...info };

    // 完成
    if (info.finished) {
      taskQueue.poll();
      if (taskQueue.size() === 0) {
        return (this.isScheduling = false);
      }
    }

    // 开启新 启动器
    if (info.startNewCallbackAble) {
      this.callbackAble(this.scheduleTask.bind(this));
    } else {
      this.scheduleTask();
    }
  }
}
