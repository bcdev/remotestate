import type { IncomingMessage, OutgoingMessage } from "./protocol";

export interface IPyreTransport {
  send(msg: IncomingMessage): void;
  subscribe(handler: (msg: OutgoingMessage) => void): () => void;
  close(): void;
}

export interface IPyreStore {
  getSnapshot(path: string): unknown;
  subscribe(listener: () => void): () => void;
  _fetchIfNeeded(path: string): void;
  dispose(): void;
}

export interface IPyreService {
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
