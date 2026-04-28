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
  getSnapshot(path: string): unknown;
  subscribe(listener: () => void): () => void;
  _fetchIfNeeded(path: string): void;
  dispose(): void;
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
