import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRemoteStateClient } from "../lib";

let websocketUrls: string[];

beforeEach(() => {
  websocketUrls = [];

  class MockWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0;
    send = vi.fn();
    close = vi.fn();

    constructor(url: string) {
      websocketUrls.push(url);
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRemoteStateClient", () => {
  it("requires a non-empty URL", () => {
    expect(() => createRemoteStateClient("")).toThrow(
      "createRemoteStateClient requires a non-empty URL",
    );
    expect(websocketUrls).toEqual([]);
  });

  it("accepts an HTTP server base URL", () => {
    const client = createRemoteStateClient("http://localhost:9753");

    expect(websocketUrls[0]).toBe("ws://localhost:9753/ws");
    client.dispose();
  });
});
