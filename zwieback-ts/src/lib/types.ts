import type { IncomingMessage, OutgoingMessage } from "./protocol";

export interface Transport {
  send(msg: IncomingMessage): void;
  subscribe(handler: (msg: OutgoingMessage) => void): () => void;
  close(): void;
}

export interface Store {
  getSnapshot(path: string): unknown;
  subscribe(listener: () => void): () => void;
  _fetchIfNeeded(path: string): void;
  dispose(): void;
}

export interface Service {
  action(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
    options?: { awaitInvalidate?: boolean },
  ): Promise<void>;
  query(
    method: string,
    args?: unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<unknown>;
}
