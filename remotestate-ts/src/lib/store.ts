import type {
  ActionResultMessage,
  GetResultMessage,
  SetResultMessage,
} from "./protocol";
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
import { DebugLog, getDebugLog } from "./debug";

const ROOT_PATH: Path = [];

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
  // Paths that came directly from the backend may satisfy provide().
  // Materialized ancestors are useful snapshots, but still need a full fetch.
  private authoritativePaths: Set<string> = new Set();
  private listeners: Set<StoreSubscription> = new Set();
  private pendingFetches: Set<string> = new Set();
  private parsedPaths: Map<string, Path> = new Map();
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
    return this.cache.get(formatPath(path));
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
        path: formatPath(path),
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
    const pathKey = formatPath(path);
    if (
      this.authoritativePaths.has(pathKey) ||
      this.pendingFetches.has(pathKey)
    ) {
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
   * @param path The parsed state path to subscribe to.
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
    this.authoritativePaths.clear();
    this.parsedPaths.clear();
  }

  private _onGetResult(msg: GetResultMessage): void {
    this._applyUpdate(msg.path, msg.value);
    this.pendingFetches.delete(msg.path);
    this._notify([msg.path]);
  }

  private _onUpdateResult(msg: ActionResultMessage | SetResultMessage): void {
    const changedPaths = Object.keys(msg.updates);
    for (const [path, value] of Object.entries(msg.updates)) {
      this._applyUpdate(path, value);
    }
    this._notify(changedPaths);
  }

  private _applyUpdate(path: string, value: unknown): void {
    this.cache.set(path, value);
    this.authoritativePaths.add(path);
    const parsedPath = this._getParsedPath(path);

    for (const relatedPath of this._getRelatedPaths(path)) {
      if (relatedPath === path) {
        continue;
      }

      const relatedSegments = this._getParsedPath(relatedPath);

      if (isPathPrefixSegments(relatedSegments, parsedPath)) {
        // A subscribed/cached ancestor changed through a leaf update.
        // Build or patch that parent snapshot so React sees a new value.
        const relativePath = pathSegmentsAfter(relatedSegments, parsedPath);
        this.cache.set(
          relatedPath,
          setPathAt(this.cache.get(relatedPath), relativePath, value),
        );
      } else if (isPathPrefixSegments(parsedPath, relatedSegments)) {
        // A subscribed/cached descendant changed through a parent update.
        // Its value is fully known because it is contained in this update.
        const relativePath = pathSegmentsAfter(parsedPath, relatedSegments);
        this.cache.set(relatedPath, getPathAt(value, relativePath));
        this.authoritativePaths.add(relatedPath);
      }
    }
  }

  private _notify(changedPaths: Iterable<string>): void {
    const paths = [...changedPaths];
    if (paths.length === 0) {
      return;
    }

    this.debugLog("Values changed for paths:", paths);

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

  private _getRelatedPaths(path: string): Set<string> {
    // Existing cache entries, active subscriptions, and pending fetches can all
    // produce snapshots that useSyncExternalStore compares after notification.
    const relatedPaths = new Set(this.cache.keys());
    for (const { path: listenerPath } of this.listeners) {
      if (pathsOverlap(path, listenerPath)) {
        relatedPaths.add(listenerPath);
      }
    }
    for (const pendingPath of this.pendingFetches) {
      if (pathsOverlap(path, pendingPath)) {
        relatedPaths.add(pendingPath);
      }
    }
    return relatedPaths;
  }
}
