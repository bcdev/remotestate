import type {
  ActionResultMessage,
  GetResultMessage,
  SetResultMessage,
} from "./protocol";
import {
  getPathAt,
  formatPath,
  getRelativePath,
  pathsOverlap,
  setPathAt,
  type Path,
} from "./path";
import type { Store, Transport } from "./types";
import { DebugLog, getDebugLog } from "./debug";

const ROOT_PATH: Path = [];

type StoreListener = () => void;
type CacheEntry = {
  path: PathKey;
  value: unknown;
};
type StoreSubscription = {
  path: PathKey;
  listener: StoreListener;
};

class PathKey {
  private constructor(
    readonly key: string,
    readonly path: Path,
  ) {}

  static from(path: Path): PathKey {
    return new PathKey(formatPath(path), [...path]);
  }
}

/**
 * Transport-backed reactive store cache.
 *
 * The store fetches missing paths from Python on demand, applies action
 * invalidation updates, and notifies listeners when related paths change.
 */
export class StoreImpl implements Store {
  private cache: Map<string, CacheEntry> = new Map();
  // Paths that came directly from the backend may satisfy provide().
  // Materialized ancestors are useful snapshots, but still need a full fetch.
  private authoritativePaths: Set<string> = new Set();
  private listeners: Set<StoreSubscription> = new Set();
  private pendingFetches: Map<string, PathKey> = new Map();
  private readonly unsubscribeTransport: () => void;
  private readonly debugLog: DebugLog;

  /**
   * Create a store cache bound to one transport.
   *
   * @param transport Transport used to request and receive state values.
   * @param debug If true, outputs debugging info to the console.
   */
  constructor(
    private readonly transport: Transport,
    debug?: boolean,
  ) {
    this.debugLog = getDebugLog(!!debug);
    this.unsubscribeTransport = transport.subscribe((msg) => {
      if (msg.type === "get_result") {
        this._onGetResult(msg);
      } else if (msg.type === "action_result" || msg.type === "set_result") {
        this._onUpdateResult(msg);
      }
    });
  }

  /**
   * Get the current cached value for a path.
   *
   * @param path The parsed state path to read. If omitted or empty, reads the
   * root state value.
   * @returns The cached value, or `undefined` if the path is not cached.
   */
  get(path: Path = ROOT_PATH): unknown {
    return this.cache.get(formatPath(path))?.value;
  }

  /**
   * Set a state value through the backend store protocol.
   *
   * @param path The parsed state path to write.
   * @param value The value to assign.
   * @returns A promise that resolves after the set result is applied.
   */
  set(path: Path, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();
      const unsubscribe = this.transport.subscribe((msg) => {
        if (!("call_id" in msg) || msg.call_id !== callId) {
          return;
        }
        unsubscribe();
        if (msg.type === "set_result") {
          resolve();
        } else if (msg.type === "error") {
          reject(new Error(msg.message));
        }
      });

      this.transport.send({
        type: "set",
        call_id: callId,
        path: [...path],
        value,
      });
    });
  }

  /**
   * Ensure a path is fetched from Python if it is not already cached.
   *
   * @param path The parsed state path to provide.
   */
  provide(path: Path): void {
    const pathKey = PathKey.from(path);
    if (
      this.authoritativePaths.has(pathKey.key) ||
      this.pendingFetches.has(pathKey.key)
    ) {
      return;
    }
    this.pendingFetches.set(pathKey.key, pathKey);
    this.transport.send({
      type: "get",
      call_id: crypto.randomUUID(),
      path: [...pathKey.path],
    });
  }

  /**
   * Register a listener for changes related to one path.
   *
   * @param path The parsed state path to subscribe to.
   * @param listener Listener called when the path or a related path changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(path: Path, listener: StoreListener): () => void {
    const subscription = { listener, path: PathKey.from(path) };
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
    this.authoritativePaths.clear();
    this.pendingFetches.clear();
  }

  private _onGetResult(msg: GetResultMessage): void {
    const path = PathKey.from(msg.path);
    this._applyUpdate(path, msg.value);
    this.pendingFetches.delete(path.key);
    this._notify([path]);
  }

  private _onUpdateResult(msg: ActionResultMessage | SetResultMessage): void {
    const updates = msg.updates.map(({ path, value }) => ({
      path: PathKey.from(path),
      value,
    }));
    for (const { path, value } of updates) {
      this._applyUpdate(path, value);
    }
    this._notify(updates.map((update) => update.path));
  }

  private _applyUpdate(path: PathKey, value: unknown): void {
    this.cache.set(path.key, { path, value });
    this.authoritativePaths.add(path.key);

    for (const relatedPath of this._getRelatedPaths(path).values()) {
      if (relatedPath.key === path.key) {
        continue;
      }

      const relativePath = getRelativePath(relatedPath.path, path.path);
      if (relativePath !== null) {
        // A subscribed/cached ancestor changed through a leaf update.
        // Build or patch that parent snapshot so React sees a new value.
        this.cache.set(relatedPath.key, {
          path: relatedPath,
          value: setPathAt(
            this.cache.get(relatedPath.key)?.value,
            relativePath,
            value,
          ),
        });
        continue;
      }

      const relatedRelativePath = getRelativePath(path.path, relatedPath.path);
      if (relatedRelativePath !== null) {
        // A subscribed/cached descendant changed through a parent update.
        // Its value is fully known because it is contained in this update.
        this.cache.set(relatedPath.key, {
          path: relatedPath,
          value: getPathAt(value, relatedRelativePath),
        });
        this.authoritativePaths.add(relatedPath.key);
      }
    }
  }

  private _notify(changedPaths: Iterable<PathKey>): void {
    const paths = [...changedPaths];
    if (paths.length === 0) {
      return;
    }

    this.debugLog(
      "Values changed for paths:",
      paths.map((path) => path.path),
    );

    for (const { listener, path } of this.listeners) {
      if (
        paths.some((changedPath) => pathsOverlap(path.path, changedPath.path))
      ) {
        listener();
      }
    }
  }

  private _getRelatedPaths(path: PathKey): Map<string, PathKey> {
    // Existing cache entries, active subscriptions, and pending fetches can all
    // produce snapshots that useSyncExternalStore compares after notification.
    const relatedPaths = new Map<string, PathKey>();
    for (const entry of this.cache.values()) {
      if (pathsOverlap(path.path, entry.path.path)) {
        relatedPaths.set(entry.path.key, entry.path);
      }
    }
    for (const subscription of this.listeners) {
      if (pathsOverlap(path.path, subscription.path.path)) {
        relatedPaths.set(subscription.path.key, subscription.path);
      }
    }
    for (const pendingPath of this.pendingFetches.values()) {
      if (pathsOverlap(path.path, pendingPath.path)) {
        relatedPaths.set(pendingPath.key, pendingPath);
      }
    }
    return relatedPaths;
  }
}
