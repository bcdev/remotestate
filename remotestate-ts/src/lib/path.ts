/**
 * A single segment in a RemoteState path.
 */
export type PathSegment = string | number;

/**
 * A parsed RemoteState path.
 *
 * An empty path addresses the root state value. Otherwise segments may be
 * strings or numeric array indices. This is the form used by store
 * implementations and other low-level helpers that already operate on
 * segmented paths.
 */
export type Path = readonly PathSegment[];

/**
 * A raw value accepted as one path segment.
 */
export type PathSegmentInput = string | number | PathSegment;

/**
 * A raw value accepted anywhere a RemoteState path is needed.
 */
export type PathInput = string | readonly PathSegmentInput[] | Path;

const PATH_SEGMENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const INVALID_PATH_MESSAGE =
  "RemoteState paths must be valid simplified JSONPath paths";
const STRING_ESCAPES: Readonly<Partial<Record<string, string>>> = {
  '"': '"',
  "'": "'",
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/**
 * Normalizes a path input value into a validated RemoteState path.
 *
 * A valid path may be empty to address the root value. Otherwise it starts
 * with an identifier or bracketed segment and may continue with dotted
 * identifiers, bracketed integer indices, or bracketed JSON string keys.
 *
 * @param path A path input value.
 * @returns The validated RemoteState path.
 * @throws A `SyntaxError` if the path is malformed.
 */
export function normalizePath(path: PathInput): Path {
  let rawPath: readonly PathSegmentInput[];
  if (typeof path === "string") {
    rawPath = parsePath(path);
  } else if (Array.isArray(path)) {
    rawPath = path;
  } else {
    throw new TypeError(
      `RemoteState path must be a string or array, but got ${typeof path}`,
    );
  }
  validatePathSegments(rawPath);
  return rawPath;
}

/**
 * Parse a dotted/bracket path like `items[1].label` into a validated path.
 *
 * RemoteState paths use a strict subset of JSONPath without the `$.` prefix:
 *
 * - an empty path addresses the root state value
 * - the first segment may be an identifier, bracketed integer index, or
 *   bracketed JSON string key
 * - later segments may be dotted identifiers, bracketed integer indices,
 *   or bracketed JSON string keys
 * - identifiers must match ``[a-zA-Z_][a-zA-Z0-9_]*``
 * - integer indices must be non-negative integers without leading zeroes
 * - string keys use JSON string literal syntax
 * - the whole string must match the grammar; prefix parsing is not allowed
 *
 * Examples:
 *
 * - empty string (root)
 * - ``user``
 * - ``[0].label``
 * - ``items[0].label``
 * - ``["display name"]``
 * - ``user["display name"]``
 *
 * @param path The path string to parse.
 * @returns The parsed RemoteState path.
 * @throws A `SyntaxError` if the input is not a strict dotted/bracket path.
 */
export function parsePath(path: string): Path {
  if (path === "") {
    return [];
  }

  const segments: PathSegment[] = [];
  let position = 0;

  while (position < path.length) {
    const next = path[position];
    if (next === ".") {
      position += 1;
      const identifier = readIdentifier(path, position);
      if (!identifier) {
        throw new SyntaxError(INVALID_PATH_MESSAGE);
      }
      segments.push(identifier.value);
      position = identifier.nextIndex;
      continue;
    }
    if (next === "[") {
      const bracketSegment = readBracketSegment(path, position);
      if (!bracketSegment) {
        throw new SyntaxError(INVALID_PATH_MESSAGE);
      }
      segments.push(bracketSegment.value);
      position = bracketSegment.nextIndex;
      continue;
    }
    if (position === 0) {
      const identifier = readIdentifier(path, position);
      if (identifier) {
        segments.push(identifier.value);
        position = identifier.nextIndex;
        continue;
      }
    }
    throw new SyntaxError(INVALID_PATH_MESSAGE);
  }

  validatePathSegments(segments);
  return segments;
}

/**
 * Format parsed RemoteState path segments back into dotted/bracket syntax.
 *
 * @param path The parsed path to format.
 * @returns The canonical string form used by the transport and cache keys.
 */
export function formatPath(path: Path): string {
  validatePathSegments(path);
  let result = "";
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (typeof segment === "number") {
      result += "[" + String(segment) + "]";
    } else if (index === 0 && PATH_SEGMENT_PATTERN.test(segment)) {
      result += segment;
    } else if (PATH_SEGMENT_PATTERN.test(segment)) {
      result += "." + segment;
    } else {
      result += "[" + JSON.stringify(segment) + "]";
    }
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
export function getPathAt(value: unknown, path: Path): unknown {
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
  path: Path,
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
  prefix: Path,
  path: Path,
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
 * @returns The remaining path segments after the prefix.
 */
export function pathSegmentsAfter(
  prefix: Path,
  path: Path,
): Path {
  return path.slice(prefix.length);
}

// --- Implementation helpers

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
  if (prefix === "") {
    return true;
  }
  if (prefix === path) {
    return true;
  }
  const next = path[prefix.length];
  return path.startsWith(prefix) && (next === "." || next === "[");
}

function validatePathSegments(
  path: readonly PathSegment[],
): asserts path is Path {
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Number.isInteger(segment) || segment < 0) {
        throw new SyntaxError(INVALID_PATH_MESSAGE);
      }
    } else if (typeof segment !== "string") {
      throw new SyntaxError(INVALID_PATH_MESSAGE);
    }
  }
}

function readIdentifier(
  path: string,
  start: number,
): { value: string; nextIndex: number } | null {
  if (start >= path.length) {
    return null;
  }
  const first = path[start];
  if (!isIdentifierStart(first)) {
    return null;
  }
  let index = start + 1;
  while (index < path.length && isIdentifierPart(path[index])) {
    index += 1;
  }
  return { value: path.slice(start, index), nextIndex: index };
}

function isIdentifierStart(char: string): boolean {
  return /[a-zA-Z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[a-zA-Z0-9_]/.test(char);
}

function readBracketSegment(
  path: string,
  start: number,
): { value: PathSegment; nextIndex: number } | null {
  if (path[start] !== "[") {
    return null;
  }
  const first: string | undefined = path[start + 1];
  if (first === '"' || first === "'") {
    const stringSegment = readQuotedStringLiteral(path, start + 1);
    if (!stringSegment || path[stringSegment.nextIndex] !== "]") {
      return null;
    }
    return {
      value: stringSegment.value,
      nextIndex: stringSegment.nextIndex + 1,
    };
  }
  if (!isDigit(first)) {
    return null;
  }
  let index = start + 1;
  while (index < path.length && isDigit(path[index])) {
    index += 1;
  }
  const digits = path.slice(start + 1, index);
  if (digits.length > 1 && digits.startsWith("0")) {
    return null;
  }
  if (index >= path.length || path[index] !== "]") {
    return null;
  }
  return {
    value: Number(digits),
    nextIndex: index + 1,
  };
}

function readQuotedStringLiteral(
  path: string,
  start: number,
): { value: string; nextIndex: number } | null {
  const quote = path[start];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  let index = start + 1;
  let value = "";
  while (index < path.length) {
    const char = path[index];
    if (char === quote) {
      return { value, nextIndex: index + 1 };
    }
    if (char !== "\\") {
      if (char.charCodeAt(0) < 0x20) {
        return null;
      }
      value += char;
      index += 1;
      continue;
    }
    index += 1;
    if (index >= path.length) {
      return null;
    }
    const escape = path[index];
    if (escape === quote) {
      value += quote;
      index += 1;
      continue;
    }
    const escaped = STRING_ESCAPES[escape];
    if (escaped !== undefined) {
      value += escaped;
      index += 1;
      continue;
    }
    if (escape === "u") {
      const unicode = readUnicodeCodeUnit(path, index + 1);
      if (!unicode) {
        return null;
      }
      if (unicode.codeUnit >= 0xd800 && unicode.codeUnit <= 0xdbff) {
        if (
          path[unicode.nextIndex] !== "\\" ||
          path[unicode.nextIndex + 1] !== "u"
        ) {
          return null;
        }
        const low = readUnicodeCodeUnit(path, unicode.nextIndex + 2);
        if (!low || low.codeUnit < 0xdc00 || low.codeUnit > 0xdfff) {
          return null;
        }
        value += String.fromCodePoint(
          ((unicode.codeUnit - 0xd800) << 10) +
            (low.codeUnit - 0xdc00) +
            0x10000,
        );
        index = low.nextIndex;
        continue;
      }
      if (unicode.codeUnit >= 0xdc00 && unicode.codeUnit <= 0xdfff) {
        return null;
      }
      value += String.fromCharCode(unicode.codeUnit);
      index = unicode.nextIndex;
      continue;
    }
    return null;
  }
  return null;
}

function readUnicodeCodeUnit(
  path: string,
  start: number,
): { codeUnit: number; nextIndex: number } | null {
  if (start + 4 > path.length) {
    return null;
  }
  const hex = path.slice(start, start + 4);
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
    return null;
  }
  return { codeUnit: Number.parseInt(hex, 16), nextIndex: start + 4 };
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
