import { describe, expect, it, expectTypeOf } from "vitest";
import {
  isPrefixPath,
  pathsOverlap,
  formatPath,
  getPathAt,
  getRelativePath,
  normalizePath,
  parsePath,
  setPathAt,
  type Path,
  type PathInput,
  type PathSegmentInput,
} from "../lib/path";

describe("parsePath", () => {
  it("parses dotted and indexed paths", () => {
    expect(parsePath("items[1].label")).toEqual(["items", 1, "label"]);
    expectTypeOf(parsePath("items[1].label")).toEqualTypeOf<Path>();
  });

  it("parses bracketed string keys", () => {
    expect(parsePath('user["display name"]')).toEqual(["user", "display name"]);
    expect(parsePath("user['display name']")).toEqual(["user", "display name"]);
    expect(parsePath('user["0"]')).toEqual(["user", "0"]);
    expect(parsePath("user['0']")).toEqual(["user", "0"]);
    expect(parsePath('items[""].label')).toEqual(["items", "", "label"]);
    expect(parsePath('user["weird.key"].value')).toEqual([
      "user",
      "weird.key",
      "value",
    ]);
    expect(parsePath('user[""]')).toEqual(["user", ""]);
  });

  it("parses bracketed string key escapes", () => {
    expect(parsePath('user["line\\nbreak"]')).toEqual(["user", "line\nbreak"]);
    expect(parsePath('user["tab\\tseparated"]')).toEqual([
      "user",
      "tab\tseparated",
    ]);
    expect(parsePath('user["quote\\"slash\\\\"]')).toEqual([
      "user",
      'quote"slash\\',
    ]);
    expect(parsePath("user['double\\\"quote']")).toEqual([
      "user",
      'double"quote',
    ]);
    expect(parsePath('user["emoji \\uD83D\\uDE00"]')).toEqual([
      "user",
      "emoji " + String.fromCodePoint(0x1f600),
    ]);
  });

  it("parses a single root segment", () => {
    expect(parsePath("count")).toEqual(["count"]);
  });

  it("parses the empty root path", () => {
    expect(parsePath("")).toEqual([]);
  });

  it("parses root bracket segments", () => {
    expect(parsePath("[0].label")).toEqual([0, "label"]);
    expect(parsePath('["display name"].value')).toEqual([
      "display name",
      "value",
    ]);
  });

  it("throws on invalid trailing input", () => {
    expect(() => parsePath("items..label")).toThrow(SyntaxError);
  });

  it("throws on invalid path starts", () => {
    expect(() => parsePath("1items")).toThrow(SyntaxError);
    expect(() => parsePath(".items")).toThrow(SyntaxError);
  });

  it("throws on non-canonical integer syntax", () => {
    expect(() => parsePath("items[01]")).toThrow(SyntaxError);
  });
});

describe("formatPath", () => {
  it("formats dotted and indexed paths", () => {
    expect(formatPath(["items", 1, "label"])).toBe("items[1].label");
  });

  it("formats bracketed string keys canonically", () => {
    expect(formatPath(["user", "display name"])).toBe('user["display name"]');
    expect(formatPath(["user", "0"])).toBe('user["0"]');
    expect(formatPath(["items", "", "label"])).toBe('items[""].label');
    expect(formatPath(["user", "weird.key", "value"])).toBe(
      'user["weird.key"].value',
    );
    expect(formatPath(["items", ""])).toBe('items[""]');
  });

  it("formats a single root segment", () => {
    expect(formatPath(["count"])).toBe("count");
  });

  it("formats the empty root path", () => {
    expect(formatPath([])).toBe("");
  });

  it("formats root bracket segments", () => {
    expect(formatPath([0, "label"])).toBe("[0].label");
    expect(formatPath(["display name", "value"])).toBe(
      '["display name"].value',
    );
  });
});

describe("normalizePath", () => {
  it("normalizes dotted strings into parsed paths", () => {
    const normalized = normalizePath("items[1].label");

    expect(normalized).toEqual(["items", 1, "label"]);
    expectTypeOf(normalized).toEqualTypeOf<Path>();
  });

  it("accepts an already parsed PathInput value without cloning", () => {
    const path = ["items", 1, "label"] as const satisfies PathInput;

    expect(normalizePath(path)).toBe(path);
  });

  it("accepts parsed relative paths", () => {
    const parsed = parsePath("items[1].label");

    expect(normalizePath(parsed)).toEqual(["items", 1, "label"]);
  });

  it("accepts string keys in array form", () => {
    expect(normalizePath(["items", "display name"])).toEqual([
      "items",
      "display name",
    ]);
    expect(normalizePath(["items", ""])).toEqual(["items", ""]);
  });

  it("accepts empty root paths", () => {
    expect(normalizePath([])).toEqual([]);
    expect(normalizePath("")).toEqual([]);
  });

  it("accepts root index and string-key paths", () => {
    expect(normalizePath([1, "label"])).toEqual([1, "label"]);
    expect(normalizePath(["", "label"])).toEqual(["", "label"]);
  });

  it("exports a PathSegmentInput type for raw segment values", () => {
    const segment = 1 satisfies PathSegmentInput;

    expect(segment).toBe(1);
  });

  it("rejects invalid array-form path segments", () => {
    expect(() => normalizePath(["items", 1.5])).toThrow(SyntaxError);
    expect(() => normalizePath(["items", -1, "label"])).toThrow(SyntaxError);
  });

  it("rejects invalid string syntax", () => {
    expect(() => normalizePath("items..label")).toThrow(SyntaxError);
    expect(() => normalizePath("items[01]")).toThrow(SyntaxError);
  });
});

describe("getPathAt", () => {
  it("reads nested object and array values", () => {
    const value = {
      items: [{ label: "alpha" }, { label: "beta" }],
      meta: { count: 2 },
    };

    expect(getPathAt(value, ["items", 1, "label"])).toBe("beta");
    expect(getPathAt(value, ["meta", "count"])).toBe(2);
  });

  it("returns undefined for missing segments", () => {
    expect(getPathAt({ items: [] }, ["items", 0, "label"])).toBeUndefined();
    expect(getPathAt(undefined, ["items"])).toBeUndefined();
  });
});

describe("setPathAt", () => {
  it("clones and updates nested object and array values", () => {
    const value = {
      items: [{ label: "alpha" }],
      meta: { count: 1 },
    };

    const updated = setPathAt(value, ["items", 0, "label"], "beta");

    expect(updated).toEqual({
      items: [{ label: "beta" }],
      meta: { count: 1 },
    });
    expect(updated).not.toBe(value);
    expect((updated as { items: unknown[] }).items).not.toBe(value.items);
    expect((updated as { items: unknown[] }).items[0]).not.toBe(value.items[0]);
    expect(value).toEqual({
      items: [{ label: "alpha" }],
      meta: { count: 1 },
    });
  });

  it("creates missing containers from the path shape", () => {
    expect(setPathAt(undefined, ["items", 0, "label"], "alpha")).toEqual({
      items: [{ label: "alpha" }],
    });
  });

  it("replaces the root value for an empty path", () => {
    expect(setPathAt({ items: [] }, [], "alpha")).toBe("alpha");
  });

  it("returns the original identity when the value is unchanged", () => {
    const value = {
      items: [{ label: "alpha" }],
      meta: { count: 1 },
    };

    expect(setPathAt(value, ["items", 0, "label"], "alpha")).toBe(value);
    expect(setPathAt(value, [], value)).toBe(value);
  });
});

describe("isPrefixPath", () => {
  it("yields true", () => {
    expect(isPrefixPath([], [])).toBe(true);
    expect(isPrefixPath([], ["a"])).toBe(true);
    expect(isPrefixPath(["a", 3], ["a", 3])).toBe(true);
    expect(isPrefixPath([0], [0, 4])).toBe(true);
    expect(isPrefixPath(["a", "b"], ["a", "b", "c"])).toBe(true);
  });
  it("yields false", () => {
    expect(isPrefixPath(["a"], [])).toBe(false);
    expect(isPrefixPath([1, 2, 3], [1, 2, 4, 6])).toBe(false);
    expect(isPrefixPath(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isPrefixPath(["a", "b"], ["a"])).toBe(false);
  });
});

describe("pathsOverlap", () => {
  it("yields true for equal paths and prefixes in either direction", () => {
    expect(pathsOverlap([], [])).toBe(true);
    expect(pathsOverlap([], ["items", 0])).toBe(true);
    expect(pathsOverlap(["items"], ["items", 0, "label"])).toBe(true);
    expect(pathsOverlap(["items", 0, "label"], ["items"])).toBe(true);
    expect(pathsOverlap(["items", 0], ["items", 0])).toBe(true);
  });

  it("yields false for siblings and partial segment matches", () => {
    expect(pathsOverlap(["items", 0], ["items", 1])).toBe(false);
    expect(pathsOverlap(["x", "y"], ["x", "yz"])).toBe(false);
    expect(pathsOverlap(["user"], ["items"])).toBe(false);
  });
});

describe("getRelativePath", () => {
  it("returns the remaining path segments when the prefix matches", () => {
    expect(getRelativePath([], ["items", 0, "label"])).toEqual([
      "items",
      0,
      "label",
    ]);
    expect(getRelativePath(["items"], ["items", 0, "label"])).toEqual([
      0,
      "label",
    ]);
    expect(getRelativePath(["items", 0], ["items", 0])).toEqual([]);
  });

  it("returns null when the prefix does not match", () => {
    expect(getRelativePath(["items", 1], ["items", 0, "label"])).toBeNull();
    expect(getRelativePath(["items", 0, "label"], ["items", 0])).toBeNull();
    expect(getRelativePath(["x", "y"], ["x", "yz"])).toBeNull();
  });
});
