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
 * - The `callId` is an internal call ID used
 *   to correlate protocol messages belonging to the same request.
 * - The `taskId` is the user-visible task key.
 */
export interface TaskState {
  callId: string;
  taskId: string;
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
  /**
   * Get the current task snapshot for the given task-ID.
   *
   * @param taskId the task-ID passed to an action or query call.
   */
  getTask(taskId: string): TaskState | undefined;

  /**
   * Get snapshots of all current tasks sorted by
   */
  getAllTasks(): readonly TaskState[];

  /**
   * Subscribes to this store by registering a listener.
   *
   * @param listener a listener that is informed about task state changes
   * @returns a function that will unregister the listener
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Mutable task store API used by the built-in controller.
 *
 * Custom stores can implement this interface to keep task state in another
 * state container such as Zustand.
 */
export interface WritableTaskStore extends TaskStore {
  /**
   * Set the task state.
   *
   * @param task the new task state.
   */
  setTask(task: TaskState): void;

  /**
   * Delete a task from this store.
   *
   * @param taskId the task-ID
   */
  deleteTask(taskId: string): void;

  /**
   * Clear this store. Removes tasks and notifies listeners.
   */
  clearTasks(): void;

  /**
   * Disposes this store. Removes tasks and listeners.
   */
  dispose?: () => void;
}

/**
 * Minimal metadata needed to register a newly started task.
 */
export interface TaskStart {
  callId: string;
  taskId: string;
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
  private listeners: Set<TaskListener> = new Set();

  getTask(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): readonly TaskState[] {
    return Array.from(this.tasks.values());
  }

  setTask(task: TaskState): void {
    this.tasks.set(task.taskId, { ...task });
    this.notify();
  }

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  deleteTask(taskId: string): void {
    if (!this.tasks.delete(taskId)) {
      return;
    }
    this.notify();
  }

  clearTasks(): void {
    if (this.tasks.size === 0) {
      return;
    }
    this.tasks.clear();
    this.notify();
  }

  dispose(): void {
    this.listeners.clear();
    this.tasks.clear();
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
    this.finishedCallIds.delete(task.callId);
    this.callToTaskId.set(task.callId, task.taskId);
    this.callSequences.set(task.callId, sequence);
    this.latestSequenceByTaskId.set(task.taskId, sequence);
    this.store.setTask({
      callId: task.callId,
      taskId: task.taskId,
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
    } else if (msg.type === "action_result" || msg.type === "query_result") {
      this.finishTask(msg.call_id, "done");
    } else if (msg.type === "error") {
      this.finishTask(msg.call_id, "error", msg.message);
    }
  }

  private applyTaskUpdate(msg: TaskUpdateMessage): void {
    if (this.finishedCallIds.has(msg.call_id)) {
      return;
    }

    const sequence = this.callSequences.get(msg.call_id);
    const expectedTid = this.callToTaskId.get(msg.call_id);
    if (sequence === undefined || expectedTid !== msg.task_id) {
      return;
    }

    if (this.isStale(msg.task_id, sequence)) {
      this.forgetTerminalCall(msg);
      return;
    }

    const previous = this.store.getTask(msg.task_id);
    const isSameCall = previous?.callId === msg.call_id;
    const now = Date.now();
    this.latestSequenceByTaskId.set(msg.task_id, sequence);

    this.store.setTask({
      callId: msg.call_id,
      taskId: msg.task_id,
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
    callId: string,
    status: TerminalTaskStatus,
    error?: ErrorMessage["message"],
  ): void {
    const taskId = this.callToTaskId.get(callId);
    if (!taskId) {
      return;
    }

    const sequence = this.callSequences.get(callId);
    this.finishedCallIds.add(callId);
    this.callToTaskId.delete(callId);
    this.callSequences.delete(callId);

    if (sequence !== undefined && this.isStale(taskId, sequence)) {
      return;
    }

    const previous = this.store.getTask(taskId);
    if (!previous || previous.callId !== callId) {
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

  private isStale(taskId: string, sequence: number): boolean {
    const latest = this.latestSequenceByTaskId.get(taskId);
    return latest !== undefined && sequence < latest;
  }

  private forgetTerminalCall(msg: TaskUpdateMessage): void {
    if (msg.status === "running") {
      return;
    }
    this.callToTaskId.delete(msg.call_id);
    this.callSequences.delete(msg.call_id);
    this.finishedCallIds.add(msg.call_id);
  }
}
