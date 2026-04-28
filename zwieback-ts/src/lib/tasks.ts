import type {
  ErrorMessage,
  OutgoingMessage,
  TaskUpdateMessage,
} from "./protocol";
import type { Transport } from "./types";

/**
 * Terminal and non-terminal task states as reported by Python.
 */
export type TaskStatus = TaskUpdateMessage["status"];

/**
 * Snapshot of one tracked action or query call.
 *
 * The `tid` is the user-visible task key. `id` is the internal call ID used
 * to correlate protocol messages belonging to the same request.
 */
export interface TaskState {
  id: string;
  tid: string;
  method: string;
  status: TaskStatus;
  name?: string;
  detail?: string;
  progress?: number;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

/**
 * Read-only task store API consumed by React hooks and external observers.
 */
export interface TaskStore {
  getSnapshot(tid: string): TaskState | undefined;
  getAllSnapshot(): readonly TaskState[];
  subscribe(listener: () => void): () => void;
}

/**
 * Mutable task store API used by the built-in controller.
 *
 * Custom stores can implement this interface to keep task state in another
 * state container such as Zustand.
 */
export interface WritableTaskStore extends TaskStore {
  setTask(task: TaskState): void;
  deleteTask(tid: string): void;
  clearTasks(): void;
  dispose?: () => void;
}

/**
 * Minimal metadata needed to register a newly started task.
 */
export interface TaskStart {
  id: string;
  tid: string;
  method: string;
}

type TaskListener = () => void;
type TerminalTaskStatus = Extract<TaskStatus, "done" | "error">;

/**
 * Default in-memory task store.
 *
 * It keeps the latest snapshot per task ID and exposes a sorted list for
 * simple UI rendering.
 */
export class TaskStoreImpl implements WritableTaskStore {
  private tasks: Map<string, TaskState> = new Map();
  private allSnapshot: TaskState[] = [];
  private listeners: Set<TaskListener> = new Set();

  getSnapshot(tid: string): TaskState | undefined {
    return this.tasks.get(tid);
  }

  getAllSnapshot(): readonly TaskState[] {
    return this.allSnapshot;
  }

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setTask(task: TaskState): void {
    this.tasks.set(task.tid, { ...task });
    this.rebuildSnapshot();
    this.notify();
  }

  deleteTask(tid: string): void {
    if (!this.tasks.delete(tid)) {
      return;
    }
    this.rebuildSnapshot();
    this.notify();
  }

  clearTasks(): void {
    if (this.tasks.size === 0) {
      return;
    }
    this.tasks.clear();
    this.rebuildSnapshot();
    this.notify();
  }

  dispose(): void {
    this.listeners.clear();
    this.tasks.clear();
    this.allSnapshot = [];
  }

  private rebuildSnapshot(): void {
    this.allSnapshot = Array.from(this.tasks.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/**
 * Create the default in-memory task store used by `createClient`.
 */
export function createTaskStore(): WritableTaskStore {
  return new TaskStoreImpl();
}

/**
 * Bridges transport-level messages to task store updates.
 *
 * The controller tracks which internal call ID belongs to which user-facing
 * task ID, applies `task_update` messages while a call is running, and marks
 * the task as done or failed when the corresponding response arrives. It also
 * guards against stale updates when the same task ID is reused for a newer call.
 */
export class TaskController {
  private readonly unsubscribeTransport: () => void;
  private callToTaskId: Map<string, string> = new Map();
  private callSequences: Map<string, number> = new Map();
  private latestSequenceByTaskId: Map<string, number> = new Map();
  private finishedCallIds: Set<string> = new Set();
  private nextSequence = 0;

  constructor(
    private readonly store: WritableTaskStore,
    transport: Transport,
  ) {
    this.unsubscribeTransport = transport.subscribe((msg) => {
      this.handleMessage(msg);
    });
  }

  startTask(task: TaskStart): void {
    const now = Date.now();
    const sequence = this.nextCallSequence();
    this.finishedCallIds.delete(task.id);
    this.callToTaskId.set(task.id, task.tid);
    this.callSequences.set(task.id, sequence);
    this.latestSequenceByTaskId.set(task.tid, sequence);
    this.store.setTask({
      id: task.id,
      tid: task.tid,
      method: task.method,
      status: "running",
      startedAt: now,
      updatedAt: now,
    });
  }

  dispose(): void {
    this.unsubscribeTransport();
    this.callToTaskId.clear();
    this.callSequences.clear();
    this.latestSequenceByTaskId.clear();
    this.finishedCallIds.clear();
  }

  private handleMessage(msg: OutgoingMessage): void {
    if (msg.type === "task_update") {
      this.applyTaskUpdate(msg);
    } else if (msg.type === "invalidate" || msg.type === "query_result") {
      this.finishTask(msg.id, "done");
    } else if (msg.type === "error") {
      this.finishTask(msg.id, "error", msg.message);
    }
  }

  private applyTaskUpdate(msg: TaskUpdateMessage): void {
    if (this.finishedCallIds.has(msg.id)) {
      return;
    }

    const sequence = this.callSequences.get(msg.id);
    const expectedTid = this.callToTaskId.get(msg.id);
    if (sequence === undefined || expectedTid !== msg.tid) {
      return;
    }

    if (this.isStale(msg.tid, sequence)) {
      this.forgetTerminalCall(msg);
      return;
    }

    const previous = this.store.getSnapshot(msg.tid);
    const isSameCall = previous?.id === msg.id;
    const now = Date.now();
    this.latestSequenceByTaskId.set(msg.tid, sequence);

    this.store.setTask({
      id: msg.id,
      tid: msg.tid,
      method: msg.method,
      status: msg.status,
      name: msg.name ?? (isSameCall ? previous.name : undefined),
      detail: msg.detail ?? (isSameCall ? previous.detail : undefined),
      progress:
        msg.progress ??
        (msg.status === "done"
          ? 100
          : isSameCall
            ? previous.progress
            : undefined),
      error:
        msg.error ??
        (msg.status === "error" && isSameCall ? previous.error : undefined),
      startedAt: isSameCall ? previous.startedAt : now,
      updatedAt: now,
    });

    this.forgetTerminalCall(msg);
  }

  private finishTask(
    id: string,
    status: TerminalTaskStatus,
    error?: ErrorMessage["message"],
  ): void {
    const tid = this.callToTaskId.get(id);
    if (!tid) {
      return;
    }

    const sequence = this.callSequences.get(id);
    this.finishedCallIds.add(id);
    this.callToTaskId.delete(id);
    this.callSequences.delete(id);

    if (sequence !== undefined && this.isStale(tid, sequence)) {
      return;
    }

    const previous = this.store.getSnapshot(tid);
    if (!previous || previous.id !== id) {
      return;
    }

    this.store.setTask({
      ...previous,
      status,
      progress: status === "done" ? 100 : previous.progress,
      error: status === "error" ? (error ?? previous.error) : undefined,
      updatedAt: Date.now(),
    });
  }

  private nextCallSequence(): number {
    this.nextSequence += 1;
    return this.nextSequence;
  }

  private isStale(tid: string, sequence: number): boolean {
    const latest = this.latestSequenceByTaskId.get(tid);
    return latest !== undefined && sequence < latest;
  }

  private forgetTerminalCall(msg: TaskUpdateMessage): void {
    if (msg.status === "running") {
      return;
    }
    this.callToTaskId.delete(msg.id);
    this.callSequences.delete(msg.id);
    this.finishedCallIds.add(msg.id);
  }
}
