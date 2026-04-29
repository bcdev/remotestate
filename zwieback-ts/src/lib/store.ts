import type { InvalidateMessage, GetResultMessage } from "./protocol";
import type { Store, Transport } from "./types";

type StoreListener = () => void;

export class StoreImpl implements Store {
  private cache: Map<string, unknown> = new Map();
  private listeners: Set<StoreListener> = new Set();
  private pendingFetches: Set<string> = new Set();
  private readonly unsubscribeTransport: () => void;

  constructor(private readonly transport: Transport) {
    this.unsubscribeTransport = transport.subscribe((msg) => {
      if (msg.type === "get_result") {
        this._onGetResult(msg);
      } else if (msg.type === "invalidate") {
        this._onInvalidate(msg);
      }
    });
  }

  get(path: string): unknown {
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

  _fetchIfNeeded(path: string): void {
    if (this.cache.has(path) || this.pendingFetches.has(path)) {
      return;
    }
    this.pendingFetches.add(path);
    this.transport.send({
      type: "get",
      call_id: crypto.randomUUID(),
      path,
    });
  }

  private _onGetResult(msg: GetResultMessage): void {
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
}
