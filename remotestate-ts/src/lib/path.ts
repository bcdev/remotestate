/**
 * A single segment in a RemoteState path.
 */
export type PathSegment = string | number;

/**
 * Parse a dotted/bracket path like `items[1].label` into path segments.
 *
 * The parser returns the parsed prefix if it encounters invalid trailing input.
 *
 * @param path The path string to parse.
 * @returns The parsed path segments.
 */
export function parsePath(path: string): PathSegment[] {
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
