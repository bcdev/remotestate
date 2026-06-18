import { describe, expect, it } from "vitest";
import { getDebugLog, debugLog } from "../lib/debug";

describe("debugLog", () => {
  it("is a function", () => {
    expect(debugLog).toBeTypeOf("function");
  });
});

describe("getDebugLog", () => {
  it("returns a logger", () => {
    expect(getDebugLog()).toBe(debugLog);
    expect(getDebugLog(true)).toBe(debugLog);
    expect(getDebugLog(1)).toBe(debugLog);
  });

  it("returns a no-op", () => {
    expect(getDebugLog(null)).toBeTypeOf("function");
    expect(getDebugLog(null)).not.toBe(debugLog);
    expect(getDebugLog(false)).not.toBe(debugLog);
    expect(getDebugLog(0)).not.toBe(debugLog);
  });
});
