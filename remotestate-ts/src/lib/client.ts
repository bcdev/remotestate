import type { ActionOptions, QueryOptions } from "./service";
import type { WritableTaskStore } from "./tasks";
import type {
  ActionMethod,
  MethodArgs,
  QueryMethod,
  QueryResult,
  Store,
} from "./types";

/**
 * Typed Remote State client used by applications and React hooks.
 *
 * @typeParam S The type that defines the available service methods.
 */
export interface RemoteStateClient<S = unknown> {
  /**
   * Reactive value cache used by the hooks.
   */
  store: Store;

  /**
   * Task store that tracks action and query progress.
   */
  tasks: WritableTaskStore;

  /**
   * Invoke a state-mutating service method.
   *
   * @param method The typed action method name.
   * @param args Positional arguments passed to the action.
   * @param kwargs Keyword arguments passed to the action.
   * @param options Action dispatch and task-tracking options.
   * @returns A promise that resolves when the action is sent, or after the
   * action result when `awaitInvalidate` is true.
   */
  action: <M extends ActionMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: ActionOptions,
  ) => Promise<void>;

  /**
   * Invoke a read-only service method.
   *
   * @param method The typed query method name.
   * @param args Positional arguments passed to the query.
   * @param kwargs Keyword arguments passed to the query.
   * @param options Query dispatch and task-tracking options.
   * @returns A promise for the typed query result.
   */
  query: <M extends QueryMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: QueryOptions,
  ) => Promise<QueryResult<S, M>>;

  /**
   * Dispose the client and release owned transport, store, and task resources.
   */
  dispose: () => void;
}

/**
 * Optional Remote State client integrations.
 *
 * Supplying `tasks` lets applications keep task state in a custom store
 * instead of the built-in in-memory implementation.
 */
export interface RemoteStateClientOptions {
  /**
   * Optional task store used instead of the default in-memory task store.
   */
  tasks?: WritableTaskStore;

  /**
   * Whether to log debugging information to the console.
   */
  debug?: boolean;
}
