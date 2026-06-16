import type { IncomingMessage, OutgoingMessage } from "./protocol";

type ReturnType<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

/**
 * Method names in a service type whose methods resolve without a value.
 *
 * @typeParam S The service method map.
 */
export type ActionKeys<S> = {
  [K in keyof S]: undefined extends ReturnType<S[K]> ? K : never;
}[keyof S];

/**
 * Method names in a service type whose methods resolve with a value.
 *
 * @typeParam S The service method map.
 */
export type QueryKeys<S> = {
  [K in keyof S]: undefined extends ReturnType<S[K]> ? never : K;
}[keyof S];

/**
 * Action method names accepted by a typed client.
 *
 * @typeParam S The service method map.
 */
export type ActionMethod<S> = unknown extends S ? string : ActionKeys<S>;

/**
 * Query method names accepted by a typed client.
 *
 * @typeParam S The service method map.
 */
export type QueryMethod<S> = unknown extends S ? string : QueryKeys<S>;

/**
 * Resolved return value for one query method.
 *
 * @typeParam S The service method map.
 * @typeParam M The query method name.
 */
export type QueryResult<S, M> = M extends keyof S ? ReturnType<S[M]> : unknown;

/**
 * Positional argument tuple for one service method.
 *
 * @typeParam S The service method map.
 * @typeParam K The method name.
 */
export type MethodArgs<S, K> = K extends keyof S
  ? S[K] extends (...args: infer A) => unknown
    ? A
    : never
  : unknown[];

/**
 * Low-level transport used by the Remote State bridge, store, and service layers.
 */
export interface Transport {
  /**
   * Send one message to Python.
   *
   * @param msg The protocol message to send.
   */
  send(msg: IncomingMessage): void;

  /**
   * Register a callback for messages received from Python.
   *
   * @param handler The callback invoked for each outgoing protocol message.
   * @returns A function that unregisters the callback.
   */
  subscribe(handler: (msg: OutgoingMessage) => void): () => void;

  /**
   * Close the transport and release any underlying resources.
   */
  close(): void;
}

/**
 * Read-only view of the reactive value cache used by hooks.
 */
export interface Store {
  /**
   * Get the current value snapshot for the given path.
   *
   * @param path The path into the state.
   * @returns The cached value, or `undefined` if the value is not cached.
   */
  get(path: string): unknown;

  /**
   * Provides the given path.
   * If the path's value is not provided yet (e.g., already cached),
   * fetch its current value (and cache it) so ``get()`` can return its
   * latest value.
   *
   * @param path The state path to provide.
   */
  provide(path: string): void;

  /**
   * Subscribes to this store by registering a listener.
   *
   * @param path The state path to subscribe to.
   * @param listener A listener that is informed about state changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(path: string, listener: () => void): () => void;

  /**
   * Disposes this store.
   */
  dispose(): void;
}

/**
 * Public API for invoking Python actions and queries through the Remote State bridge.
 */
export interface Service {
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
  action(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
    options?: { awaitInvalidate?: boolean; taskId?: string },
  ): Promise<void>;

  /**
   * Invoke a read-only Python service method.
   *
   * @param method The service query name.
   * @param args Positional arguments passed to the query.
   * @param kwargs Keyword arguments passed to the query.
   * @param options Query dispatch and task-tracking options.
   * @returns A promise for the value returned by the query.
   */
  query(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
    options?: { taskId?: string },
  ): Promise<unknown>;
}
