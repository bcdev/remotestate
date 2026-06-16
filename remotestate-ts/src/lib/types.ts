import type { IncomingMessage, OutgoingMessage } from "./protocol";

type ReturnType<T> = T extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

export type ActionKeys<S> = {
  [K in keyof S]: undefined extends ReturnType<S[K]> ? K : never;
}[keyof S];

export type QueryKeys<S> = {
  [K in keyof S]: undefined extends ReturnType<S[K]> ? never : K;
}[keyof S];

export type ActionMethod<S> = unknown extends S ? string : ActionKeys<S>;

export type QueryMethod<S> = unknown extends S ? string : QueryKeys<S>;

export type QueryResult<S, M> = M extends keyof S ? ReturnType<S[M]> : unknown;

export type MethodArgs<S, K> = K extends keyof S
  ? S[K] extends (...args: infer A) => unknown
    ? A
    : never
  : unknown[];

/**
 * Low-level transport used by the Remote State bridge, store, and service layers.
 */
export interface Transport {
  send(msg: IncomingMessage): void;
  subscribe(handler: (msg: OutgoingMessage) => void): () => void;
  close(): void;
}

/**
 * Read-only view of the reactive value cache used by hooks.
 */
export interface Store {
  /**
   * Get the current value snapshot for the given path.
   * @param path the path into the state
   */
  get(path: string): unknown;

  /**
   * Provides the given path.
   * If the path's value is not provided yet (e.g., already cached),
   * fetch its current value (and cache it) so ``get()`` can return its
   * latest value.
   */
  provide(path: string): void;

  /**
   * Subscribes to this store by registering a listener.
   *
   * @param path the state path to subscribe to
   * @param listener a listener that is informed about state changes
   * @returns a function that will unregister the listener
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
  action(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
    options?: { awaitInvalidate?: boolean; taskId?: string },
  ): Promise<void>;
  query(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
    options?: { taskId?: string },
  ): Promise<unknown>;
}
