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
  /**
   * Internal call ID used to correlate protocol messages.
   */
  callId: string;

  /**
   * User-supplied task ID passed to an action or query.
   */
  taskId: string;

  /**
   * Service method associated with the tracked call.
   */
  method: string;

  /**
   * Current task status.
   */
  status: TaskStatus;

  /**
   * Optional short task name for display.
   */
  name?: string;

  /**
   * Optional task detail for display.
   */
  detail?: string;

  /**
   * Optional progress percentage from 0 to 100.
   */
  progress?: number;

  /**
   * Optional error message when the task is in the `error` state.
   */
  error?: string;

  /**
   * Timestamp when the tracked call started, in milliseconds since epoch.
   */
  startedAt: number;

  /**
   * Timestamp when the task was last updated, in milliseconds since epoch.
   */
  updatedAt: number;
}

/**
 * Read-only task store API consumed by React hooks and external observers.
 */
export interface TaskStore {
  /**
   * Get the current task snapshot for the given task-ID.
   *
   * @param taskId The task-ID passed to an action or query call.
   * @returns The current task snapshot, or `undefined` if not tracked.
   */
  getTask(taskId: string): TaskState | undefined;

  /**
   * Get snapshots of all current tasks.
   *
   * @returns All current task snapshots.
   */
  getAllTasks(): readonly TaskState[];

  /**
   * Subscribes to this store by registering a listener.
   *
   * @param listener A listener that is informed about task state changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Mutable task store API used by the built-in controller.
 *
 * Custom tasks can implement this interface to keep task state in another
 * state container such as Zustand.
 */
export interface WritableTaskStore extends TaskStore {
  /**
   * Set the task state.
   *
   * @param task The new task state.
   */
  setTask(task: TaskState): void;

  /**
   * Delete a task from this store.
   *
   * @param taskId The task-ID to delete.
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
  /**
   * Internal call ID used to correlate protocol messages.
   */
  callId: string;

  /**
   * User-supplied task ID.
   */
  taskId: string;

  /**
   * Service method associated with the task.
   */
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

  /**
   * Get the current task snapshot for the given task-ID.
   *
   * @param taskId The task-ID passed to an action or query call.
   * @returns The current task snapshot, or `undefined` if not tracked.
   */
  getTask(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get snapshots of all current tasks.
   *
   * @returns All current task snapshots.
   */
  getAllTasks(): readonly TaskState[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Set the task state and notify subscribers.
   *
   * @param task The new task state.
   */
  setTask(task: TaskState): void {
    this.tasks.set(task.taskId, { ...task });
    this.notify();
  }

  /**
   * Register a listener for task state changes.
   *
   * @param listener A listener that is informed about task state changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Delete a task and notify subscribers when it existed.
   *
   * @param taskId The task-ID to delete.
   */
  deleteTask(taskId: string): void {
    if (!this.tasks.delete(taskId)) {
      return;
    }
    this.notify();
  }

  /**
   * Remove all tasks and notify subscribers when the store changed.
   */
  clearTasks(): void {
    if (this.tasks.size === 0) {
      return;
    }
    this.tasks.clear();
    this.notify();
  }

  /**
   * Clear all tasks and listeners.
   */
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
 * Create the default in-memory task store used by `createRemoteStateClient`.
 *
 * @returns A writable in-memory task store.
 */
export function createRemoteTaskStore(): WritableTaskStore {
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

  /**
   * Create a task controller for one transport.
   *
   * @param store Writable task store that receives task state changes.
   * @param transport Transport that emits task and result messages.
   */
  constructor(
    private readonly store: WritableTaskStore,
    transport: Transport,
  ) {
    this.unsubscribeTransport = transport.subscribe((msg) => {
      this.handleMessage(msg);
    });
  }

  /**
   * Register a newly started tracked call.
   *
   * @param task Metadata for the tracked task.
   */
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

  /**
   * Stop listening to transport messages and clear internal tracking state.
   */
  dispose(): void {
    this.unsubscribeTransport();
    this.callToTaskId.clear();
    this.callSequences.clear();
    this.latestSequenceByTaskId.clear();
    this.finishedCallIds.clear();
  }

  private handleMessage(msg: OutgoingMessage): void {
    if (msg.type === "update_task") {
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
