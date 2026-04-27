import { useEffect, useSyncExternalStore } from "react";
import type { InvalidateMessage, GetResultMessage } from "./protocol";
import type { IPyreStore, IPyreTransport } from "./types";

type StoreListener = () => void;

export class PyreStore implements IPyreStore {
  private cache: Map<string, unknown> = new Map();
  private listeners: Set<StoreListener> = new Set();
  private pendingFetches: Set<string> = new Set();
  private readonly unsubscribeTransport: () => void;

  constructor(private readonly transport: IPyreTransport) {
    this.unsubscribeTransport = transport.subscribe((msg) => {
      if (msg.type === "get_result") {
        this._onValue(msg);
      } else if (msg.type === "invalidate") {
        this._onInvalidate(msg);
      }
    });
  }

  private _onValue(msg: GetResultMessage): void {
    this.cache.set(msg.path, msg.value);
    this.pendingFetches.delete(msg.path);
    this._notify();
  }

  private _onInvalidate(msg: InvalidateMessage): void {
    for (const [path, value] of Object.entries(msg.updates)) {
      this.cache.set(path, value);
    }
    this._notify();
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  _fetchIfNeeded(path: string): void {
    if (this.cache.has(path) || this.pendingFetches.has(path)) {
      return;
    }
    this.pendingFetches.add(path);
    this.transport.send({
      type: "get",
      id: crypto.randomUUID(),
      path,
    });
  }

  getSnapshot(path: string): unknown {
    return this.cache.get(path);
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.unsubscribeTransport();
    this.listeners.clear();
    this.cache.clear();
  }
}

// --- Hook ---

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function usePyreStore<T>(
  store: IPyreStore,
  path: string,
): T | undefined {
  // Trigger fetch if not cached — runs after render, not during,
  // so getSnapshot remains pure and side effect free.
  useEffect(() => {
    store._fetchIfNeeded(path);
  }, [store, path]);

  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(path) as T | undefined,
  );
}
