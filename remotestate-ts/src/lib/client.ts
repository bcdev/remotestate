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
  store: Store;
  tasks: WritableTaskStore;

  action: <M extends ActionMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: ActionOptions,
  ) => Promise<void>;

  query: <M extends QueryMethod<S>>(
    method: M,
    args?: MethodArgs<S, M>,
    kwargs?: Record<string, unknown>,
    options?: QueryOptions,
  ) => Promise<QueryResult<S, M>>;

  dispose: () => void;
}

/**
 * Optional Remote State client integrations.
 *
 * Supplying `taskStore` lets applications keep task state in a custom store
 * instead of the built-in in-memory implementation.
 */
export interface RemoteStateClientOptions {
  taskStore?: WritableTaskStore;
}
