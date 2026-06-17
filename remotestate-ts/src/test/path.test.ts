import { describe, expect, it } from "vitest";
import { formatPath, getPathAt, parsePath, setPathAt } from "../lib";

describe("parsePath", () => {
  it("parses dotted and indexed paths", () => {
    expect(parsePath("items[1].label")).toEqual(["items", 1, "label"]);
  });

  it("parses a single root segment", () => {
    expect(parsePath("count")).toEqual(["count"]);
  });

  it("returns the parsed prefix for invalid trailing input", () => {
    expect(parsePath("items..label")).toEqual(["items"]);
  });

  it("returns an empty path for invalid roots", () => {
    expect(parsePath("1items")).toEqual([]);
  });
});

describe("formatPath", () => {
  it("formats dotted and indexed paths", () => {
    expect(formatPath(["items", 1, "label"])).toBe("items[1].label");
  });

  it("formats a single root segment", () => {
    expect(formatPath(["count"])).toBe("count");
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
