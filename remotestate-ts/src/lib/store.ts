import type { ActionResultMessage, GetResultMessage } from "./protocol";
import type { Store, Transport } from "./types";

type StoreListener = () => void;
type StoreSubscription = {
  path: string;
  listener: StoreListener;
};
type PathSegment = string | number;

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

    for (const [cachedPath, cachedValue] of [...this.cache.entries()]) {
      if (cachedPath === path) {
        continue;
      }

      if (isPathPrefix(cachedPath, path)) {
        const relativePath = pathSegmentsAfter(cachedPath, path);
        this.cache.set(cachedPath, setAtPath(cachedValue, relativePath, value));
      } else if (isPathPrefix(path, cachedPath)) {
        const relativePath = pathSegmentsAfter(path, cachedPath);
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
}

function pathsOverlap(left: string, right: string): boolean {
  return isPathPrefix(left, right) || isPathPrefix(right, left);
}

function isPathPrefix(prefix: string, path: string): boolean {
  if (prefix === path) {
    return true;
  }
  const next = path[prefix.length];
  return path.startsWith(prefix) && (next === "." || next === "[");
}

function pathSegmentsAfter(prefix: string, path: string): PathSegment[] {
  return parsePath(path).slice(parsePath(prefix).length);
}

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const first = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(path);
  if (!first || first.index !== 0) {
    return segments;
  }
  segments.push(first[0]);

  const segmentPattern = /\.([a-zA-Z_][a-zA-Z0-9_]*)|\[(\d+)\]/g;
  segmentPattern.lastIndex = first[0].length;
  let position = first[0].length;
  let match: RegExpExecArray | null;
  while ((match = segmentPattern.exec(path)) !== null) {
    if (match.index !== position) {
      return segments;
    }
    const token = match[0];
    if (token.startsWith(".")) {
      segments.push(token.slice(1));
    } else {
      segments.push(Number(token.slice(1, -1)));
    }
    position = segmentPattern.lastIndex;
  }

  return position === path.length ? segments : [];
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
