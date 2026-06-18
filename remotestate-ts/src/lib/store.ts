import type { ActionResultMessage, GetResultMessage } from "./protocol";
import {
  getPathAt,
  formatPath,
  parsePath,
  pathSegmentsAfter,
  pathsOverlap,
  setPathAt,
  isPathPrefixSegments,
  type Path,
} from "./path";
import type { Store, Transport } from "./types";

type StoreListener = () => void;
type StoreSubscription = {
  path: string;
  listener: StoreListener;
};

/**
 * Transport-backed reactive store cache.
 *
 * The store fetches missing paths from Python on demand, applies action
 * invalidation updates, and notifies listeners when related paths change.
 */
export class StoreImpl implements Store {
  private cache: Map<string, unknown> = new Map();
  private listeners: Set<StoreSubscription> = new Set();
  private pendingFetches: Set<string> = new Set();
  private parsedPaths: Map<string, Path> = new Map();
  private readonly unsubscribeTransport: () => void;

  /**
   * Create a store cache bound to one transport.
   *
   * @param transport Transport used to request and receive state values.
   */
  constructor(private readonly transport: Transport) {
    this.unsubscribeTransport = transport.subscribe((msg) => {
      if (msg.type === "get_result") {
        this._onGetResult(msg);
      } else if (msg.type === "action_result") {
        this._onActionResult(msg);
      }
    });
  }

  /**
   * Get the current cached value for a path.
   *
   * @param path The parsed non-empty state path to read.
   * @returns The cached value, or `undefined` if the path is not cached.
   */
  get(path: Path): unknown {
    return this.cache.get(formatPath(path));
  }

  /**
   * Set a state value through the backend's built-in `set` action.
   *
   * @param path The parsed non-empty state path to write.
   * @param value The value to assign.
   * @returns A promise that resolves after the action result is applied.
   */
  set(path: Path, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();
      const unsubscribe = this.transport.subscribe((msg) => {
        if (!("call_id" in msg) || msg.call_id !== callId) {
          return;
        }
        unsubscribe();
        if (msg.type === "action_result") {
          resolve();
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      });

      this.transport.send({
        type: "action",
        call_id: callId,
        method: "set",
        args: [formatPath(path), value],
        kwargs: {},
      });
    });
  }

  /**
   * Ensure a path is fetched from Python if it is not already cached.
   *
   * @param path The parsed non-empty state path to provide.
   */
  provide(path: Path): void {
    const pathKey = formatPath(path);
    if (this.cache.has(pathKey) || this.pendingFetches.has(pathKey)) {
      return;
    }
    this.pendingFetches.add(pathKey);
    this.transport.send({
      type: "get",
      call_id: crypto.randomUUID(),
      path: pathKey,
    });
  }

  /**
   * Register a listener for changes related to one path.
   *
   * @param path The parsed non-empty state path to subscribe to.
   * @param listener Listener called when the path or a related path changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(path: Path, listener: StoreListener): () => void {
    const subscription = { listener, path: formatPath(path) };
    this.listeners.add(subscription);
    return () => {
      this.listeners.delete(subscription);
    };
  }

  /**
   * Stop listening to transport messages and clear local cache/listeners.
   */
  dispose(): void {
    this.unsubscribeTransport();
    this.listeners.clear();
    this.cache.clear();
    this.parsedPaths.clear();
  }

  private _onGetResult(msg: GetResultMessage): void {
    this.cache.set(msg.path, msg.value);
    this.pendingFetches.delete(msg.path);
    this._notify([msg.path]);
  }

  private _onActionResult(msg: ActionResultMessage): void {
    const changedPaths = Object.keys(msg.updates);
    for (const [path, value] of Object.entries(msg.updates)) {
      this._applyUpdate(path, value);
    }
    this._notify(changedPaths);
  }

  private _applyUpdate(path: string, value: unknown): void {
    this.cache.set(path, value);
    const parsedPath = this._getParsedPath(path);
    if (parsedPath.length === 0) {
      return;
    }

    for (const [cachedPath, cachedValue] of [...this.cache.entries()]) {
      if (cachedPath === path) {
        continue;
      }

      const cachedSegments = this._getParsedPath(cachedPath);
      if (cachedSegments.length === 0) {
        continue;
      }

      if (isPathPrefixSegments(cachedSegments, parsedPath)) {
        const relativePath = pathSegmentsAfter(cachedSegments, parsedPath);
        this.cache.set(cachedPath, setPathAt(cachedValue, relativePath, value));
      } else if (isPathPrefixSegments(parsedPath, cachedSegments)) {
        const relativePath = pathSegmentsAfter(parsedPath, cachedSegments);
        this.cache.set(cachedPath, getPathAt(value, relativePath));
      }
    }
  }

  private _notify(changedPaths: Iterable<string>): void {
    const paths = [...changedPaths];
    if (paths.length === 0) {
      return;
    }

    for (const { listener, path } of this.listeners) {
      if (paths.some((changedPath) => pathsOverlap(path, changedPath))) {
        listener();
      }
    }
  }

  private _getParsedPath(path: string): Path {
    const cached = this.parsedPaths.get(path);
    if (cached) {
      return cached;
    }
    const parsedPath = parsePath(path);
    this.parsedPaths.set(path, parsedPath);
    return parsedPath;
  }
}
