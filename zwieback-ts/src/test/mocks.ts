import { vi } from "vitest";
import type { Transport, Store } from "../lib/types";

export interface MockTransport {
  send: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

export interface MockTransportWithTrigger extends MockTransport {
  _trigger: (msg: unknown) => void;
}

export interface MockStore {
  getSnapshot: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  _fetchIfNeeded: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function asTransport(mock: MockTransport): Transport {
  return mock as unknown as Transport;
}

export function asStore(mock: MockStore): Store {
  return mock as unknown as Store;
}

export function mockTransport(): MockTransport {
  return {
    subscribe: vi.fn(() => vi.fn()),
    send: vi.fn(),
    close: vi.fn(),
  };
}

export function mockTransportWithHandler(): MockTransportWithTrigger {
  const handlers: Set<(msg: unknown) => void> = new Set();
  return {
    subscribe: vi.fn((h: (msg: unknown) => void) => {
      handlers.add(h);
      return vi.fn(() => {
        handlers.delete(h);
      });
    }),
    send: vi.fn(),
    close: vi.fn(),
    _trigger: (msg) => {
      for (const handler of handlers) {
        handler(msg);
      }
    },
  };
}

export function mockStore(): MockStore {
  return {
    getSnapshot: vi.fn(() => undefined),
    subscribe: vi.fn(() => vi.fn()),
    _fetchIfNeeded: vi.fn(),
    dispose: vi.fn(),
  };
}
