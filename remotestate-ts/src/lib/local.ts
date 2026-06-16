import type { RemoteStateClient } from "./client";
import { createRemoteTaskStore, type WritableTaskStore } from "./tasks";
import {
  type ActionMethod,
  type MethodArgs,
  type QueryMethod,
  type QueryResult,
  type Store,
} from "./types";

type Awaitable<T> = T | Promise<T>;
type ServiceMethod<S, K> = K extends keyof S
  ? S[K] extends (...args: infer A) => unknown
    ? (...args: A) => Awaitable<unknown>
    : never
  : never;

/**
 * Local action handlers used by `createLocalRemoteStateClient`.
 *
 * @typeParam S The type that defines the available service methods.
 */
export type LocalActionHandlers<S = unknown> = unknown extends S
  ? Record<string, (...args: unknown[]) => Awaitable<void>>
  : Partial<{
      [K in Extract<ActionMethod<S>, string>]: ServiceMethod<S, K>;
    }>;

/**
 * Local query handlers used by `createLocalRemoteStateClient`.
 *
 * @typeParam S The type that defines the available service methods.
 */
export type LocalQueryHandlers<S = unknown> = unknown extends S
  ? Record<string, (...args: unknown[]) => Awaitable<unknown>>
  : Partial<{
      [K in Extract<QueryMethod<S>, string>]: ServiceMethod<S, K>;
    }>;

/**
 * Options for creating a local RemoteState-compatible client.
 *
 * Supplying `tasks` lets applications keep task state in a custom store
 * instead of the built-in in-memory implementation.
 */
export interface LocalRemoteStateClientOptions<S = unknown> {
  store: Store;
  tasks?: WritableTaskStore;
  actions?: LocalActionHandlers<S>;
  queries?: LocalQueryHandlers<S>;
  dispose?: () => void;
}

/**
 * Create a RemoteState-compatible client backed by local application state.
 *
 * This helper is useful for `RemoteStateProvider` fallbacks: callers provide a
 * reactive `Store` plus local action/query handlers, and the helper supplies
 * the `RemoteStateClient` wrapper expected by React hooks.
 *
 * @typeParam S The type that defines the available service methods.
 * @param options Local client options.
 */
export function createLocalRemoteStateClient<S = unknown>(
  options: LocalRemoteStateClientOptions<S>,
): RemoteStateClient<S> {
  const { store, actions = {}, queries = {}, dispose } = options;
  const taskStore = options.tasks ?? createRemoteTaskStore();
  const ownsTaskStore = options.tasks === undefined;
  const actionHandlers: Partial<
    Record<string, (...args: unknown[]) => Awaitable<unknown>>
  > = actions;
  const queryHandlers: Partial<
    Record<string, (...args: unknown[]) => Awaitable<unknown>>
  > = queries;

  return {
    store,
    tasks: taskStore,

    action: async (method, args = [] as never) => {
      const handler = actionHandlers[String(method)];
      if (!handler) {
        throw new Error(`Unsupported local action: ${String(method)}`);
      }
      await handler(...args);
    },

    query: async <M extends QueryMethod<S>>(
      method: M,
      args: MethodArgs<S, M> = [] as never,
    ) => {
      const handler = queryHandlers[String(method)];
      if (!handler) {
        throw new Error(`Unsupported local query: ${String(method)}`);
      }
      return (await handler(...args)) as QueryResult<S, M>;
    },

    dispose: () => {
      dispose?.();
      store.dispose();
      if (ownsTaskStore && taskStore.dispose) {
        taskStore.dispose();
      }
    },
  };
}
