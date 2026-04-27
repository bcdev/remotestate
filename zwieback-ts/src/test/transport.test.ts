// src/test/transport.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PyreTransport } from "../lib/transport";

interface MockWs {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

let lastMockWs: MockWs;
let instanceCount: number;

beforeEach(() => {
  instanceCount = 0;

  class MockWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0; // CONNECTING
    send = vi.fn();
    close = vi.fn();

    constructor() {
      instanceCount++;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastMockWs = this;
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
});

describe("PyreTransport", () => {
  it("sends message immediately when connected", () => {
    const transport = new PyreTransport("ws://localhost:9753/ws");
    lastMockWs.readyState = 1; // OPEN
    transport.send({ type: "get", id: "1", path: "count" });
    expect(lastMockWs.send).toHaveBeenCalledOnce();
  });

  it("queues messages when not yet connected", () => {
    const transport = new PyreTransport("ws://localhost:9753/ws");
    lastMockWs.readyState = 0; // CONNECTING
    transport.send({ type: "get", id: "1", path: "count" });
    expect(lastMockWs.send).not.toHaveBeenCalled();
  });

  it("flushes queued messages on connect", () => {
    const transport = new PyreTransport("ws://localhost:9753/ws");
    lastMockWs.readyState = 0; // CONNECTING

    transport.send({ type: "get", id: "1", path: "count" });
    transport.send({ type: "get", id: "2", path: "user.name" });

    lastMockWs.readyState = 1; // OPEN
    if (lastMockWs.onopen) {
      lastMockWs.onopen();
    }

    expect(lastMockWs.send).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribers on incoming message", () => {
    const transport = new PyreTransport("ws://localhost:9753/ws");
    const handler = vi.fn();
    transport.subscribe(handler);

    const msg = { type: "value", id: "1", path: "count", value: 42 };
    if (lastMockWs.onmessage) {
      lastMockWs.onmessage({ data: JSON.stringify(msg) });
    }

    expect(handler).toHaveBeenCalledWith(msg);
  });

  it("unsubscribe stops notifications", () => {
    const transport = new PyreTransport("ws://localhost:9753/ws");
    const handler = vi.fn();
    const unsubscribe = transport.subscribe(handler);
    unsubscribe();

    const msg = { type: "value", id: "1", path: "count", value: 42 };
    if (lastMockWs.onmessage) {
      lastMockWs.onmessage({ data: JSON.stringify(msg) });
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it("reconnects after disconnect with exponential backoff", () => {
    vi.useFakeTimers();
    new PyreTransport("ws://localhost:9753/ws");

    if (lastMockWs.onclose) {
      lastMockWs.onclose();
    }
    vi.advanceTimersByTime(1000);

    expect(instanceCount).toBe(2);
    vi.useRealTimers();
  });

  it("does not reconnect after close()", () => {
    vi.useFakeTimers();
    const transport = new PyreTransport("ws://localhost:9753/ws");
    transport.close();

    if (lastMockWs.onclose) {
      lastMockWs.onclose();
    }
    vi.advanceTimersByTime(5000);

    expect(instanceCount).toBe(1);
    vi.useRealTimers();
  });
});
