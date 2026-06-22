import type { Service, Transport } from "./types";
import type { TaskController } from "./tasks";
import type { ActionMessage, QueryMessage } from "./protocol";

type Args = unknown[];
type Kwargs = Record<string, unknown>;

/**
 * Options controlling action dispatch and optional task tracking.
 */
export interface ActionOptions {
  /**
   * If true, waits for the ActionResultMessage before resolving.
   */
  awaitInvalidate?: boolean;
  /**
   * Bridge-supplied task ID for progress tracking via `useRemoteTask()`.
   * If omitted, task progress tracking is disabled for this call.
   */
  taskId?: string;
}

/**
 * Options controlling query dispatch and optional task tracking.
 */
export interface QueryOptions {
  /**
   * Bridge-supplied task ID for progress tracking via `useRemoteTask()`.
   * If omitted, task progress tracking is disabled for this call.
   */
  taskId?: string;
}

/**
 * Sends action and query requests over the transport layer.
 *
 * When a `taskId` is supplied, the service also registers the request with the
 * task controller so progress updates can be surfaced to the UI.
 */
export class ServiceImpl implements Service {
  /**
   * Create a service bridge.
   *
   * @param transport Transport used to send and receive protocol messages.
   * @param taskController Optional controller used for task progress tracking.
   */
  constructor(
    private readonly transport: Transport,
    private readonly taskController?: TaskController,
  ) {}

  /**
   * Invoke a state-mutating Python service method.
   *
   * @param method The service action name.
   * @param args Positional arguments passed to the action.
   * @param kwargs Keyword arguments passed to the action.
   * @param options Action dispatch and task-tracking options.
   * @returns A promise that resolves when the action is sent, or after the
   * action result when `awaitInvalidate` is true.
   */
  async action(
    method: string,
    args: Args = [],
    kwargs: Kwargs = {},
    options: ActionOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();
      if (options.taskId !== undefined) {
        this.taskController?.startTask({
          callId: callId,
          taskId: options.taskId,
          method,
        });
      }

      if (options.awaitInvalidate) {
        const unsubscribe = this.transport.subscribe((msg) => {
          if (msg.type === "error" && msg.call_id === callId) {
            unsubscribe();
            reject(new Error(msg.message));
            return;
          }
          if (msg.type === "action_result" && msg.call_id === callId) {
            unsubscribe();
            resolve();
          }
        });
      }

      const message: ActionMessage = {
        type: "action",
        call_id: callId,
        method,
        args,
        kwargs,
      };
      if (options.taskId) {
        message.task_id = options.taskId;
      }
      this.transport.send(message);

      if (!options.awaitInvalidate) {
        resolve();
      }
    });
  }

  /**
   * Invoke a read-only Python service method.
   *
   * @param method The service query name.
   * @param args Positional arguments passed to the query.
   * @param kwargs Keyword arguments passed to the query.
   * @param options Query dispatch and task-tracking options.
   * @returns A promise for the value returned by the query.
   */
  async query(
    method: string,
    args: Args = [],
    kwargs: Kwargs = {},
    options: QueryOptions = {},
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();
      if (options.taskId !== undefined) {
        this.taskController?.startTask({
          callId: callId,
          taskId: options.taskId,
          method,
        });
      }

      const unsubscribe = this.transport.subscribe((msg) => {
        if (!("call_id" in msg) || msg.call_id !== callId) {
          return;
        }
        if (msg.type === "query_result") {
          unsubscribe();
          resolve(msg.value);
        } else if (msg.type === "error") {
          unsubscribe();
          reject(new Error(msg.message));
        }
      });

      const message: QueryMessage =
        options.taskId === undefined
          ? { type: "query", call_id: callId, method, args, kwargs }
          : {
              type: "query",
              call_id: callId,
              task_id: options.taskId,
              method,
              args,
              kwargs,
            };
      this.transport.send(message);
    });
  }
}
