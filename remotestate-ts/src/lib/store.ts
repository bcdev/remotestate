import type {
  ActionResultMessage,
  GetResultMessage,
  PatchOperation,
} from "./protocol";
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
      } else if (msg.type === "action_result") {
        this._onActionResult(msg);
      }
    });
  }

  get(path: string): unknown {
    return this.cache.get(path);
  }

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

  private _onGetResult(msg: GetResultMessage): void {
    this.cache.set(msg.path, msg.value);
    this.pendingFetches.delete(msg.path);
    this._notify();
  }

  private _onActionResult(msg: ActionResultMessage): void {
    for (const patch of msg.patches) {
      this._applyPatch(patch);
    }
    this._notify();
  }

  private _applyPatch(patch: PatchOperation): void {
    const path = jsonPointerToPath(patch.path);
    this.cache.set(path, patch.value);
    this._refreshCachedDescendants(path, patch.value);
  }

  private _refreshCachedDescendants(path: string, value: unknown): void {
    for (const cachedPath of Array.from(this.cache.keys())) {
      if (!isDescendantPath(path, cachedPath)) {
        continue;
      }
      const relativePath = cachedPath.slice(path.length);
      const result = getRelativeValue(value, relativePath);
      if (result.found) {
        this.cache.set(cachedPath, result.value);
      } else {
        this.cache.delete(cachedPath);
      }
    }
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function jsonPointerToPath(pointer: string): string {
  if (pointer === "") {
    return "";
  }
  return pointer
    .split("/")
    .slice(1)
    .map(unescapeJsonPointerSegment)
    .map((segment, i) => {
      if (i > 0 && /^\d+$/.test(segment)) {
        return `[${segment}]`;
      }
      return `${i === 0 ? "" : "."}${segment}`;
    })
    .join("");
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  return (
    candidatePath.startsWith(`${parentPath}.`) ||
    candidatePath.startsWith(`${parentPath}[`)
  );
}

function getRelativeValue(
  value: unknown,
  relativePath: string,
): { found: true; value: unknown } | { found: false } {
  let current = value;
  let pos = 0;
  while (pos < relativePath.length) {
    if (current === null || current === undefined) {
      return { found: false };
    }
    if (relativePath[pos] === ".") {
      const nextPos = readPropertyEnd(relativePath, pos + 1);
      const key = relativePath.slice(pos + 1, nextPos);
      if (typeof current !== "object") {
        return { found: false };
      }
      const record = current as Record<string, unknown>;
      if (!(key in record)) {
        return { found: false };
      }
      current = record[key];
      pos = nextPos;
    } else if (relativePath[pos] === "[") {
      const close = relativePath.indexOf("]", pos);
      if (close === -1) {
        return { found: false };
      }
      const index = Number(relativePath.slice(pos + 1, close));
      if (!Array.isArray(current) || index >= current.length) {
        return { found: false };
      }
      current = current[index];
      pos = close + 1;
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

function readPropertyEnd(path: string, start: number): number {
  let pos = start;
  while (pos < path.length && /[A-Za-z0-9_]/.test(path[pos])) {
    pos += 1;
  }
  return pos;
}
