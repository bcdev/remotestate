import { describe, expect, it } from "vitest";
import { parsePath } from "../lib";

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
