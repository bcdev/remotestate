import type { IncomingMessage, OutgoingMessage } from "./protocol";

/**
 * Low-level transport used by the client, store, and service layers.
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
   * Subscribes to this store by registering a listener.
   *
   * @param listener a listener that is informed about state changes
   * @returns a function that will unregister the listener
   */
  subscribe(listener: () => void): () => void;

  /**
   * Disposes this store.
   */
  dispose(): void;

  _fetchIfNeeded(path: string): void;
}

/**
 * Public API for invoking Python actions and queries.
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
