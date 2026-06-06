import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../lib/client";

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

describe("createClient", () => {
  it("uses the ws query parameter when no URL is provided", () => {
    vi.stubGlobal("location", {
      search: "?ws=ws%3A%2F%2Flocalhost%3A9753%2Fws",
      protocol: "http:",
      host: "localhost:5173",
      pathname: "/",
    });

    const client = createClient();

    expect(websocketUrls[0]).toBe("ws://localhost:9753/ws");
    client.dispose();
  });

  it("falls back to the current origin without including the page path", () => {
    vi.stubGlobal("location", {
      search: "",
      protocol: "https:",
      host: "example.test",
      pathname: "/ui/route",
    });

    const client = createClient();

    expect(websocketUrls[0]).toBe("wss://example.test/ws");
    client.dispose();
  });

  it("accepts an HTTP server base URL", () => {
    const client = createClient("http://localhost:9753");

    expect(websocketUrls[0]).toBe("ws://localhost:9753/ws");
    client.dispose();
  });
});
