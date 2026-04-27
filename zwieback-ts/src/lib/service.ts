import type { Service, Transport } from "./types";

type Args = unknown[];
type Kwargs = Record<string, unknown>;

export interface ActionOptions {
  /**
   * If true, waits for the InvalidateMessage before resolving.
   */
  awaitInvalidate?: boolean;
  /**
   * Client-supplied task ID for progress tracking via useTask().
   * Defaults to the auto-generated call ID if not provided.
   */
  taskId?: string;
}

export interface QueryOptions {
  /**
   * Client-supplied task ID for progress tracking via useTask().
   * Defaults to the auto-generated call ID if not provided.
   */
  taskId?: string;
}

export class ServiceImpl implements Service {
  constructor(private readonly transport: Transport) {}

  async action(
    method: string,
    args: Args = [],
    kwargs: Kwargs = {},
    options: ActionOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const tid = options.taskId ?? id;

      const unsubscribe = this.transport.subscribe((msg) => {
        if (msg.type === "error" && msg.id === id) {
          unsubscribe();
          reject(new Error(msg.message));
          return;
        }
        if (
          options.awaitInvalidate &&
          msg.type === "invalidate" &&
          msg.id === id
        ) {
          unsubscribe();
          resolve();
        }
      });

      this.transport.send({ type: "action", id, tid, method, args, kwargs });

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
      const tid = options.taskId ?? id;

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

      this.transport.send({ type: "query", id, tid, method, args, kwargs });
    });
  }
}
