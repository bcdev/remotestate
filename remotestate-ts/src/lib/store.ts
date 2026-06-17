import type { ActionResultMessage, GetResultMessage } from "./protocol";
import { parsePath, type PathSegment } from "./path";
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
  private parsedPaths: Map<string, readonly PathSegment[]> = new Map();
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
   * @param path The state path to read.
   * @returns The cached value, or `undefined` if the path is not cached.
   */
  get(path: string): unknown {
    return this.cache.get(path);
  }

  /**
   * Set a state value through the backend's built-in `set` action.
   *
   * @param path The state path to write.
   * @param value The value to assign.
   * @returns A promise that resolves after the action result is applied.
   */
  set(path: string, value: unknown): Promise<void> {
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
        args: [path, value],
        kwargs: {},
      });
    });
  }

  /**
   * Ensure a path is fetched from Python if it is not already cached.
   *
   * @param path The state path to provide.
   */
  provide(path: string): void {
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

  /**
   * Register a listener for changes related to one path.
   *
   * @param path The state path to subscribe to.
   * @param listener Listener called when the path or a related path changes.
   * @returns A function that unregisters the listener.
   */
  subscribe(path: string, listener: StoreListener): () => void {
    const subscription = { listener, path };
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
    const pathSegments = this._getParsedPath(path);
    if (pathSegments.length === 0) {
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

      if (isPathPrefixSegments(cachedSegments, pathSegments)) {
        const relativePath = pathSegmentsAfter(cachedSegments, pathSegments);
        this.cache.set(cachedPath, setAtPath(cachedValue, relativePath, value));
      } else if (isPathPrefixSegments(pathSegments, cachedSegments)) {
        const relativePath = pathSegmentsAfter(pathSegments, cachedSegments);
        this.cache.set(cachedPath, getAtPath(value, relativePath));
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

  private _getParsedPath(path: string): readonly PathSegment[] {
    const cached = this.parsedPaths.get(path);
    if (cached) {
      return cached;
    }
    const parsed = parsePath(path);
    this.parsedPaths.set(path, parsed);
    return parsed;
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return isPathPrefix(left, right) || isPathPrefix(right, left);
}

function isPathPrefixSegments(
  prefix: readonly PathSegment[],
  path: readonly PathSegment[],
): boolean {
  if (prefix.length > path.length) {
    return false;
  }
  return prefix.every((segment, index) => segment === path[index]);
}

function isPathPrefix(prefix: string, path: string): boolean {
  if (prefix === path) {
    return true;
  }
  const next = path[prefix.length];
  return path.startsWith(prefix) && (next === "." || next === "[");
}

function pathSegmentsAfter(
  prefix: readonly PathSegment[],
  path: readonly PathSegment[],
): PathSegment[] {
  return path.slice(prefix.length);
}

function getAtPath(value: unknown, path: readonly PathSegment[]): unknown {
  let current = value;
  for (const segment of path) {
    current = getChild(current, segment);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

function setAtPath(
  value: unknown,
  path: readonly PathSegment[],
  childValue: unknown,
): unknown {
  if (path.length === 0) {
    return childValue;
  }

  const [segment, ...rest] = path;
  const clone = cloneContainer(value, segment);
  const previousChild = getChild(clone, segment);
  setChild(clone, segment, setAtPath(previousChild, rest, childValue));
  return clone;
}

function cloneContainer(
  value: unknown,
  nextSegment: PathSegment,
): unknown[] | Record<string, unknown> {
  if (isUnknownArray(value)) {
    return [...value];
  }
  if (isRecord(value)) {
    return { ...value };
  }
  return typeof nextSegment === "number" ? [] : {};
}

function getChild(value: unknown, segment: PathSegment): unknown {
  if (isUnknownArray(value) && typeof segment === "number") {
    return value[segment];
  }
  if (isRecord(value)) {
    return value[String(segment)];
  }
  return undefined;
}

function setChild(
  container: unknown[] | Record<string, unknown>,
  segment: PathSegment,
  value: unknown,
): void {
  if (isUnknownArray(container) && typeof segment === "number") {
    container[segment] = value;
  } else if (!isUnknownArray(container)) {
    container[String(segment)] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !isUnknownArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
