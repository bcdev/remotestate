import type { IncomingMessage, OutgoingMessage } from "./protocol";

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
