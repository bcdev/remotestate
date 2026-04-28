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
   * If true, waits for the InvalidateMessage before resolving.
   */
  awaitInvalidate?: boolean;
  /**
   * Client-supplied task ID for progress tracking via useTask().
   * If omitted, task progress tracking is disabled for this call.
   */
  taskId?: string;
}

/**
 * Options controlling query dispatch and optional task tracking.
 */
export interface QueryOptions {
  /**
   * Client-supplied task ID for progress tracking via useTask().
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
  constructor(
    private readonly transport: Transport,
    private readonly taskController?: TaskController,
  ) {}

  async action(
    method: string,
    args: Args = [],
    kwargs: Kwargs = {},
    options: ActionOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      if (options.taskId !== undefined) {
        this.taskController?.startTask({ id, tid: options.taskId, method });
      }

      if (options.awaitInvalidate) {
        const unsubscribe = this.transport.subscribe((msg) => {
          if (msg.type === "error" && msg.id === id) {
            unsubscribe();
            reject(new Error(msg.message));
            return;
          }
          if (msg.type === "invalidate" && msg.id === id) {
            unsubscribe();
            resolve();
          }
        });
      }

      const message: ActionMessage =
        options.taskId === undefined
          ? { type: "action", id, method, args, kwargs }
          : { type: "action", id, tid: options.taskId, method, args, kwargs };
      this.transport.send(message);

      if (!options.awaitInvalidate) {
        resolve();
      }
    });
  }

  async query(
    method: string,
    args: Args = [],
    kwargs: Kwargs = {},
    options: QueryOptions = {},
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      if (options.taskId !== undefined) {
        this.taskController?.startTask({ id, tid: options.taskId, method });
      }

      const unsubscribe = this.transport.subscribe((msg) => {
        if (!("id" in msg) || msg.id !== id) {
          return;
        }
        unsubscribe();
        if (msg.type === "query_result") {
          resolve(msg.value);
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      });

      const message: QueryMessage =
        options.taskId === undefined
          ? { type: "query", id, method, args, kwargs }
          : { type: "query", id, tid: options.taskId, method, args, kwargs };
      this.transport.send(message);
    });
  }
}
