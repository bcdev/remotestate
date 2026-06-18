/**
 * A single segment in a RemoteState path.
 */
export type PathSegment = string | number;

/**
 * A relative RemoteState path comprising property names or
 * integer array indices.
 */
export type RelativePath = readonly PathSegment[];

/**
 * A non-empty parsed path.
 *
 * The first segment is always a string identifier; later segments may be
 * strings or numeric array indices. This is the form used by store
 * implementations and other low-level helpers that already operate on
 * segmented paths.
 */
export type Path = readonly [string, ...RelativePath];

/**
 * A value of type ``PathLike`` can be normalized into a value of type `Path`.
 */
export type PathLike = string | RelativePath | Path;

/**
 * Normalizes a path-like value into a validated RemoteState path.
 *
 * @param path A path-like value.
 * @returns The validated RemoteState path.
 */
export function normalizePath(path: PathLike): Path {
  let rawPath: readonly PathSegment[];
  if (typeof path === "string") {
    rawPath = parsePath(path);
  } else {
    rawPath = path;
  }
  if (rawPath.length === 0) {
    throw new Error("RemoteState paths must be non-empty");
  }
  if (typeof rawPath[0] !== "string" || rawPath[0] === "") {
    throw new Error(
      "RemoteState paths must start with a non-empty property name",
    );
  }
  return rawPath as unknown as Path;
}

/**
 * Parse a dotted/bracket path like `items[1].label` into path segments.
 *
 * The parser returns the parsed prefix if it encounters invalid trailing input.
 *
 * @param path The path string to parse.
 * @returns The parsed path segments.
 */
export function parsePath(path: string): RelativePath {
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

/**
 * Format parsed RemoteState path segments back into dotted/bracket syntax.
 *
 * @param path The parsed path to format.
 * @returns The canonical string form used by the transport and cache keys.
 */
export function formatPath(path: Path): string {
  let result = path[0];
  for (let index = 1; index < path.length; index += 1) {
    const segment = path[index];
    result +=
      typeof segment === "number" ? "[" + String(segment) + "]" : "." + segment;
  }
  return result;
}

/**
 * Helper for client fallback implementors to read a value at a nested path.
 *
 * @param value The root value to read from.
 * @param path The path segments to follow.
 * @returns The nested value, or `undefined` if any segment is missing.
 */
export function getPathAt(value: unknown, path: RelativePath): unknown {
  let current = value;
  for (const segment of path) {
    current = getChild(current, segment);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

/**
 * Helper for client fallback implementors to write a value at a nested path.
 *
 * The helper returns a cloned structure so callers can update fallback state
 * without mutating the original value.
 *
 * @param value The root value to update.
 * @param path The path segments to follow.
 * @param childValue The value to place at the target path.
 * @returns A cloned value with the nested update applied.
 */
export function setPathAt(
  value: unknown,
  path: RelativePath,
  childValue: unknown,
): unknown {
  if (path.length === 0) {
    return Object.is(value, childValue) ? value : childValue;
  }

  const ancestors: unknown[] = [value];
  let current = value;
  for (const segment of path) {
    current = getChild(current, segment);
    ancestors.push(current);
  }

  if (Object.is(current, childValue)) {
    return value;
  }

  let nextValue = childValue;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index];
    const container = cloneContainer(ancestors[index], segment);
    setChild(container, segment, nextValue);
    nextValue = container;
  }

  return nextValue;
}

/**
 * Check whether one parsed path is a prefix of another parsed path.
 *
 * @param prefix The candidate prefix path.
 * @param path The full path to compare against.
 * @returns Whether `prefix` is the same path or an ancestor of `path`.
 */
export function isPathPrefixSegments(
  prefix: RelativePath,
  path: RelativePath,
): boolean {
  if (prefix.length > path.length) {
    return false;
  }
  return prefix.every((segment, index) => segment === path[index]);
}

/**
 * Check whether two string paths overlap by ancestor/descendant relationship.
 *
 * @param left The first path string.
 * @param right The second path string.
 * @returns Whether either path is a prefix of the other.
 */
export function pathsOverlap(left: string, right: string): boolean {
  return isPathPrefix(left, right) || isPathPrefix(right, left);
}

/**
 * Drop a prefix from a path.
 *
 * @param prefix The prefix to remove.
 * @param path The full parsed path.
 * @returns The remaining relative path after the prefix.
 */
export function pathSegmentsAfter(
  prefix: RelativePath,
  path: RelativePath,
): RelativePath {
  return path.slice(prefix.length);
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

function isPathPrefix(prefix: string, path: string): boolean {
  if (prefix === path) {
    return true;
  }
  const next = path[prefix.length];
  return path.startsWith(prefix) && (next === "." || next === "[");
}
